import contextlib
import logging
import re
from pathlib import Path
from typing import List

import git
import git.exc
import requests

from houdini_package_manager.meta.meta_tools import RateLimitError, RequestConnectionError, UserDataManager
from houdini_package_manager.wrangle.url import Url


class GitProject:
    """
    A git-based project that consists of a local git repository and remote git repository for a single plugin.

    Arguments:
        get_remote (bool):
            Whether or not to fetch the local repo's remote repo data immediately after initializing the local repo data.
            The default is False. This allows the data to be fetched later at a more convenient time via user request.
    """

    def __init__(self, path: Path = None, get_remote=False) -> None:
        if not isinstance(path, Path) and path is not None:
            raise TypeError("Project path must be a Path or None.")

        if isinstance(path, Path) and not path.exists():
            raise FileNotFoundError(f"{path} does not exist.")

        self.local_path = None
        self.remote_url = None
        self.init_path(path)

        self.name = None
        self.owner = None

        self.user_data_manager = UserDataManager()

        self._local_git_repo = None  # complex git module object
        self.init_local_git_repo()
        self.local = Local()  # contains self.tags
        self.remote = Remote()  # contains self.tags
        self.init_repo_data(get_remote)

    def init_repo_data(self, get_remote=False) -> None:
        """
        Extracts any useful metadata from the local git repo and cached remote user data.

        If get_remote is True then the remote repo's data will be fetch and stored locally.
        The default is False.
        """

        """
        TODO:
        - There seems to be some duplicate tag setting being done (might be ok if its local & remote separately),
        due to logs reporting: 'Updated list of known remote tags to: ...' twice.
        If not a problem, document it and debug loggers to specify local vs remote data setting.

        COMPARE LOCAL FETCHED TAGS TO THE CACHED REMORE TAGS TO SEE WHAT'S THE TRUE LATEST TAG. This will account for a case
        where a repo gets updated locally to a new tag but the remote hasn't yet been updated.
        """

        if self._local_git_repo:
            self.extract_local_data()

            self.local.tags = self.extract_latest_tag_from_local_repo()
            if get_remote:
                self.remote.tags = self.fetch_remote_tags()

        cache = self.user_data_manager.get_entry(self.name)
        if cache:
            self.remote.tags = cache["tags"]

    def init_path(self, path) -> None:
        """
        Determines what type the incoming path is and sets the local and remote repo path attributes accordingly.
        """

        if isinstance(path, Path):
            self.local_path = path
            return

        if isinstance(path, Url):
            self.remote_url = path

    def extract_local_data(self) -> None:
        """
        Extract useful data from the local git module repo.
        """

        self._find_remote_repo_url()
        self._extract_owner()

    def extract_latest_tag_from_local_repo(self) -> str:
        """
        Extract the latest tag version from the local repo.
        Returns a string if successful.
        Returns None if not successful.
        """

        if self.local_path:
            try:
                return self._local_git_repo.git.describe(tags=True, abbrev=0)
            except git.exc.GitCommandError:
                pass
        return None

    def init_local_git_repo(self) -> None:
        """
        Create the local third party Repo object from the local path using the git module.
        If there is no .git folder present within the path's location, then no Repo will be created.

        The Repo object contains more data than is needed for HPM so we extract only what we need and store
        it in simplified custom repo objects.
        """

        if self.local_path:
            with contextlib.suppress(git.exc.InvalidGitRepositoryError):
                self._local_git_repo = git.Repo(self.local_path)

    def _extract_owner(self):
        """
        Extract the user name and repo name from the remote url.
        """

        if self.remote_url:
            split_url = str(self.remote_url).split("/")
            self.owner = split_url[-2]
            self.name = split_url[-1].split(".")[0]

    def _find_remote_repo_url(self) -> Url | None:
        """
        Find the plugin's remote source control repository URL on the local system.
        This is done by extracting the URL from the plugin path's .git folder, if it exists.

        Returns a Url object of the remote repo if it is found.
        Returns None if no Url is found.
        """

        if self.remote_url or not self.local_path:
            return

        try:
            self._local_git_repo = git.Repo(self.local_path)
        except git.exc.InvalidGitRepositoryError:
            return

        remote_urls = [remote.url for remote in self._local_git_repo.remotes]
        if remote_urls:
            self.remote_url = Url(remote_urls[0])

    def fetch_latest_remote_tag(self) -> str | None:
        """
        Gets the latest tag version from the remote repo.

        First fetches all the remote tags from a GitHub API request, then grabs the first tag.

        Returns a string if successful.
        Returns None if unsuccesful.
        """

        if self.remote_url is None:
            logging.warning("Repo URL is None (Package most likely has no remote repo). Ignoring API request command.")
            return None

        self.fetch_remote_tags()
        return self.remote.tag_latest

    def fetch_remote_tags(self, paginate=True, cache=True) -> List[str] | list:
        """
        Fetches tags from the remote repo and caches them.

        GitHub's API for fetching tags prevents requesting >100 tags in one request.
        Multiple requests and pagination is required to fetch all of a remote repo's
        tags if there are >100.

        Caching means:
            1. Storing the fetched tags locally in the user's json data.
            2. Updating the repo object (self.remote.tags) that mimics the remote tag state.

        Arguments:
            paginate (bool):
                Whether or not to keep making API requests as many times as necessary
                to fetch every possible tag via pagination. This will be necessary if more
                than the max number of tags per page (100) is required to be fetched.

            cache (bool):
                The tags that get fetched from the remote repo will be cached.
                The default is True.

        Returns:
            A list of strings if successful.
            An empty list if unsuccessful.

        Raises:
            RateLimitError: Fetch failed! Rate limited while fetching tags from '{api_tags_url}'. Status code: {response_tags.status_code}.
        """

        if self.remote_url is None:
            logging.warning("Repo URL is None (Package most likely has no remote repo). Ignoring API request command.")
            return []

        api_tags_url = f"https://api.github.com/repos/{self.owner}/{self.name}/tags"

        tags = self._fetch_all_pages(api_tags_url) if paginate else self._fetch_single_page(api_tags_url)

        if cache:
            logging.debug(f"{self.name} current list of known remote tags: {self.remote.tags}")
            self.remote.tags = tags
            self.user_data_manager.update_tags(self.name, self.remote.tags)

        return tags

    def _fetch_single_page(self, api_tags_url: str) -> List[str]:
        """
        Makes one single API request for tags (one page).

        Returns:
            A maximum of 100 tags, even if there are more on the remote repo.
            If rate limiting occurs, a RateLimitError exception occurs and no tags are returned.
        """

        tags_per_request = 100  # GitHub's API per_page max is 100
        response_tags = self._make_request(api_tags_url, params={"per_page": tags_per_request})

        if response_tags:
            tags = response_tags.json()
            tags = [tag["name"] for tag in tags]  # convert response to simple list of versions
            return tags

        return []

    def _fetch_all_pages(self, api_tags_url: str) -> List[str]:
        """
        Continually makes API requests for tags (multiple pages) until all tags are fetched.

        Returns:
            All possible tags from the remote repo.
            If rate limiting occurs, a RateLimitError exception occurs and no tags are returned.
        """

        tags_per_request = 100  # GitHub's API per_page max is 100
        pagination_page = 1  # starting page number for pagination
        all_tags = []

        while True:
            response_tags = self._make_request(
                api_tags_url, params={"per_page": tags_per_request, "page": pagination_page}
            )

            if response_tags:
                tags = response_tags.json()
                if not tags:  # no more tags to fetch
                    break
                all_tags.extend(tag["name"] for tag in tags)

                if len(tags) < tags_per_request:  # no more tags on future page requests
                    break

                pagination_page += 1
            else:
                break

        return all_tags

    def _make_request(self, url: str, params: dict) -> requests.Response | None:
        """
        Makes a GET request to the specified URL with given parameters and handles the response.

        This method handles the common logic for making a GET request to the GitHub API, checking
        for rate limiting, and logging appropriate messages based on the response status code.

        Arguments:
            url (str): The URL to send the GET request to.
            params (dict): The query parameters to include in the GET request.

        Returns:
            requests.Response: The response object if the request is successful.
            None: If the request fails with a status code other than 200 or 403.

        Raises:
            RateLimitError: If the request fails due to rate limiting (status code 403).
        """

        request_timeout = 5  # seconds

        try:
            response = requests.get(url, params=params, timeout=request_timeout)
        except requests.exceptions.ConnectionError as e:
            message = f"Fetch failed! Unable to establish connection to {url}"
            logging.error(message)
            logging.error(e)
            raise RequestConnectionError(message) from e

        if response.status_code == 200:  # success
            return response
        elif response.status_code == 403:  # rate limited
            message = (
                f"Fetch failed! Rate limited while fetching tags from '{url}'. Status code: {response.status_code}."
            )
            logging.warning(message)
            raise RateLimitError(message)
        else:
            logging.warning(
                f"Failed to fetch tags for {self.owner}/{self.name} at '{url}'. Status code:"
                f" {response.status_code}. (Package most likely has no remote repo.)"
            )
            return None


class _Repo:
    def __init__(self, tags: list | str | None) -> None:
        """
        The template for local and remote repository classes.

        This functions as a simplified repository object compared to the git module Repo object type.

        Arguments:
            tags:
                A string or list of strings of tag names.
        """

        self._tags = []
        self.tags = tags  # trigger setter

    @property
    def tag_latest(self) -> str:
        """
        The latest tag version.
        """

        if self.tags:
            return self.tags[0]
        return None

    @property
    def tags(self) -> List[str] | List[None]:
        """
        The list of known tags.
        """

        return self._tags

    @tags.setter
    def tags(self, new_tags: str | List[str] | None) -> None:
        """
        Sets a list of the known (given) tag version(s).

        Gracefully merges new tags with old tags.
        If continuity between new and old tags can't be found, the old tags are replaced with the new tags.
        """

        if new_tags is None:
            return
        elif isinstance(new_tags, list) and not new_tags:  # empty list
            return
        elif not isinstance(new_tags, str) and not all(isinstance(item, str) for item in new_tags):
            raise TypeError(f"tags {type(new_tags)} must be a str or list of str.")

        if isinstance(new_tags, str):
            new_tags = [new_tags]

        if self._tags == new_tags:
            logging.debug("Skipping tag list merge. Fetched tags list is identical to known list.")
            return

        if not self._tags:
            self._tags = new_tags
        else:
            self._tags = self._merge_version_lists(new_tags)
        logging.debug(f"Updated list of known remote tags to: {self._tags}")

    def _version_key(self, version):
        """
        Extracts numeric and non-numeric parts separately.
        """

        return [int(part) if part.isdigit() else part for part in re.split("([0-9]+)", version)]

    def _merge_version_lists(self, new_tags):
        """
        Gracefully merges the lists of new tags with old tags if possible.

        This is done by looking for common tag versions between the current and the fetched lists.
        If there are common tags, the two lists are joined with no duplicates and returned.
        If continuity between new and old tags can't be found, the old tags are replaced with the new tags.
        """

        # use sets for duplicate checking
        old_versions_set = set(self.tags)
        new_versions_set = set(new_tags)

        common_versions = old_versions_set & new_versions_set

        if common_versions:
            # merge and sort unique versions if there are common versions
            combined_versions = sorted(old_versions_set | new_versions_set, key=self._version_key, reverse=True)
            logging.debug("Common tag versions found between known and fetched tag lists. Merged lists.")
            return list(combined_versions)
        else:
            return new_tags


class Local(_Repo):
    def __init__(self, tags=None) -> None:
        super().__init__(tags)


class Remote(_Repo):
    def __init__(self, tags=None) -> None:
        super().__init__(tags)
