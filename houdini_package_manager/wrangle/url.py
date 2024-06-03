from urllib.parse import urlparse


class Url:
    """
    A URL path and its parsed result.
    """

    def __init__(self, url: str | None) -> None:
        if not isinstance(url, str):
            raise TypeError("URL must be a string.")

        self._url = url
        self.parse = urlparse(url)  # ParseResult

    def __str__(self) -> str:
        return self._url

    def __repr__(self) -> str:
        return self._url

    @property
    def stem(self) -> str:
        """
        The final path element of the URL, excluding the extension.
        """

        s = self.__str__()
        s = s.split("/")
        stem = s[-1]
        stem = stem.split(".")
        stem = stem[0]
        return stem
