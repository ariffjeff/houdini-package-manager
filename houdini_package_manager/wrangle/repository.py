import logging
from pathlib import Path
from typing import List, Union

import git
import git.exc
import requests

from houdini_package_manager.wrangle.url import Url


class Project:
    """
    A git project comprised of a local and remote repository.
    """

    def __init__(self, path: Path = None) -> None:
        if not isinstance(path, Path) and path is not None:
            raise TypeError("Project path must be a Path or None.")

        if isinstance(path, Path) and not path.exists():
            raise FileNotFoundError(f"{path} does not exist.")

        self.local_path = None
        self.remote_url = None
        self.init_path(path)

        self._local_repo = None
        # self.local_repo_tags = None
        local_latest_install_tag = None
        if path:
            try:
                self._local_repo = git.Repo(self.local_path)
                # self.local_repo_tags = sorted(self._local_repo.tags, key=lambda tag: tag.commit.committed_date)
                local_latest_install_tag = self._local_repo.git.describe(tags=True, abbrev=0)
            except (git.exc.InvalidGitRepositoryError, git.exc.GitCommandError):
                pass

        self.name = None
        self.owner = None

        if self._local_repo:
            self.extract_local_data()

            self.local = Local(local_latest_install_tag)
            self.remote = Remote(self._get_latest_remote_tag())
        else:
            self.local = Local()
            self.remote = Remote()

    def init_path(self, path) -> None:
        """
        Determines what type the incoming path is and sets the local and remote attributes accordingly.
        """

        if isinstance(path, Path):
            self.local_path = path
            return

        if isinstance(path, Url):
            self.remote_url = path

    def extract_local_data(self) -> None:
        """
        Extract useful data from the local repo.
        """

        self._find_remote_repo_url()
        self._extract_owner()

    def _extract_owner(self):
        """
        Extract the user name and repo name from the remote url.
        """

        if self.remote_url:
            split_url = str(self.remote_url).split("/")
            self.owner = split_url[-2]
            self.name = split_url[-1].split(".")[0]

    def _find_remote_repo_url(self) -> Union[Url, None]:
        """
        Find the plugin's remote source control repository URL.
        This is done by extracting the URL from the plugin path's .git folder, if it exists.

        Returns a Url object of the remote repo if it is found.
        Returns None if no Url is found.
        """

        if self.remote_url or not self.local_path:
            return

        try:
            self._local_repo = git.Repo(self.local_path)
        except git.exc.InvalidGitRepositoryError:
            return

        remote_urls = [remote.url for remote in self._local_repo.remotes]
        if remote_urls:
            self.remote_url = Url(remote_urls[0])

    def _get_latest_remote_tag(self) -> Union[List[str], list]:
        """
        Make an GitHub API request for the latest tag on the remote repo.
        This only requests 1 tag which will be the most recent. This allows us to avoid needing to sort
        the remote tags if they are unsorted commit time.
        """

        url_tags = f"https://api.github.com/repos/{self.owner}/{self.name}/tags"
        response_tags = requests.get(url_tags, params={"per_page": 1}, timeout=5)
        if response_tags.status_code == 200:
            tags = response_tags.json()
            tag_names = [tag["name"] for tag in tags]
            return tag_names
        elif response_tags.status_code == 403:
            logging.warning(
                f"Rate limited while fetching tags for '{url_tags}'. Status code: {response_tags.status_code}"
            )
        else:
            logging.warning(
                f"Failed to fetch tags for {self.owner}/{self.name} at '{url_tags}'. Status code:"
                f" {response_tags.status_code}"
            )
        return []

    # def get_all_remote_tags(self) -> list:
    # """
    # Get all remote repo tags.
    # Currently broken due to several reasons. One being that the github api does not return single requests for tags greater than 100. Getting >100 tags would require multiple requests due to pagination.

    # Considerations:
    # - A single commit can have multiple tags assigned to it, either by mistake or for other reasons. This must be accounted for.
    # """
    #     url_tags = f"https://api.github.com/repos/{self.owner}/{self.name}/tags"
    #     response_tags = requests.get(url_tags, params={'per_page': 1}, timeout=5)
    #     if response_tags.status_code == 200:
    #         tags = response_tags.json()

    #         # Build a mapping between commit SHAs and tag names
    #         commit_to_tag = {}
    #         for tag in tags:
    #             commit_sha = tag['commit']['sha']
    #             tag_name = tag['name']
    #             if commit_sha not in commit_to_tag:
    #                 commit_to_tag[commit_sha] = [tag_name]
    #             else:
    #                 commit_to_tag[commit_sha].append(tag_name)

    #         # Extract commit SHAs for all tags
    #         commit_shas = commit_to_tag.keys()

    #         # Fetch commit information for all tags in a single request
    #         url_commits = f"https://api.github.com/repos/{self.owner}/{self.name}/commits"
    #         params = {'sha': commit_shas}
    #         response_commits = requests.get(url_commits, params=params, timeout=5)
    #         if response_commits.status_code == 200:
    #             commit_info = response_commits.json()

    #             # Create a dictionary mapping tag names to commit dates
    #             tag_commits = {}
    #             for commit in commit_info:
    #                 commit_sha = commit['sha']
    #                 tag_names = commit_to_tag.get(commit_sha, [])
    #                 for tag_name in tag_names:
    #                     commit_date = commit['commit']['committer']['date']
    #                     tag_commits[tag_name] = commit_date

    #             # Sort tags by commit date (most recent first)
    #             sorted_tags = sorted(tag_commits.items(), key=lambda x: x[1], reverse=True)
    #             sorted_tag_names = [tag[0] for tag in sorted_tags]

    #             return sorted_tag_names

    #         else:
    #             logging.warning(f"Failed to fetch commit info for tags of {self.owner}/{self.name}. Status code: {response_commits.status_code}")
    #     elif response_tags.status_code == 403:
    #         logging.warning(f"Rate limited while fetching tags for '{url_tags}'. Status code: {response_tags.status_code}")
    #         return None
    #     else:
    #         logging.warning(f"Failed to fetch tags for {self.owner}/{self.name} at '{url_tags}'. Status code: {response_tags.status_code}")
    #         return None


class Repo:
    def __init__(self, tags: Union[list, str, None]) -> None:
        if not isinstance(tags, list) and not isinstance(tags, str) and tags is not None:
            raise TypeError(f"tags ({type(tags)}) must be a list, str, or None.")

        if isinstance(tags, str):
            tags = [tags]

        self.tags = None
        if tags:
            self.tags = [str(tag) for tag in tags]

    @property
    def tag_latest(self) -> str:
        if self.tags:
            return self.tags[-1]
        return None


class Local(Repo):
    def __init__(self, tags=None) -> None:
        super().__init__(tags)
        # if self.tags:
        # self.tags = self.tags[::-1] # reverse order to be latest tag as first element


class Remote(Repo):
    def __init__(self, tags=None) -> None:
        super().__init__(tags)
