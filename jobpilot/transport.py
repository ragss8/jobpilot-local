"""Verified HTTPS reads for public discovery sources."""
import ipaddress
import socket
import ssl
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit


def tls_context():
    paths = ssl.get_default_verify_paths()
    if paths.cafile or paths.capath:
        return ssl.create_default_context()
    # python.org macOS installations may lack their optional certificate link.
    for name in ('/etc/ssl/cert.pem', '/opt/homebrew/etc/openssl@3/cert.pem'):
        if Path(name).is_file():
            return ssl.create_default_context(cafile=name)
    return ssl.create_default_context()


def validate_public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Discovery requires a public HTTPS URL')
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Private network destinations are not allowed')
    return url


class PublicRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, url):
        validate_public_url(url)
        return super().redirect_request(request, fp, code, msg, headers, url)


def read_public(url, limit=3_000_000, timeout=20):
    validate_public_url(url)
    request = urllib.request.Request(url, headers={
        'User-Agent': 'JobPilotLocal/0.2 (personal job discovery)',
        'Accept': 'text/html,application/json,application/rss+xml,application/xml;q=0.9'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), PublicRedirects(),
                                        urllib.request.HTTPSHandler(context=tls_context()))
    with opener.open(request, timeout=timeout) as response:
        raw = response.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('Source response exceeds the size limit')
        return raw.decode(response.headers.get_content_charset() or 'utf-8', errors='replace'), response.url
