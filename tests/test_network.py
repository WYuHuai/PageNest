import ipaddress

import httpx
import pytest

from collector import network
from collector.network import UnsafeDownloadUrl, decode_data_url, fetch_bytes, validate_download_url


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://user:password@example.com/secret",
        "http://127.0.0.1/private",
        "http://10.0.0.1/private",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/private",
        "http://metadata.google.internal/computeMetadata/v1/",
    ],
)
async def test_private_and_unsafe_download_urls_are_blocked(url):
    with pytest.raises(UnsafeDownloadUrl):
        await validate_download_url(url)


@pytest.mark.asyncio
async def test_local_networks_require_opt_in_but_metadata_stays_blocked():
    assert await validate_download_url(
        "http://127.0.0.1/image.png",
        allow_local_networks=True,
    )
    with pytest.raises(UnsafeDownloadUrl):
        await validate_download_url(
            "http://169.254.169.254/latest/meta-data",
            allow_local_networks=True,
        )


@pytest.mark.asyncio
async def test_mixed_dns_answers_are_rejected(monkeypatch):
    async def mixed_addresses(_host, _port):
        return {
            ipaddress.ip_address("93.184.216.34"),
            ipaddress.ip_address("192.168.1.5"),
        }

    monkeypatch.setattr(network, "_resolve_addresses", mixed_addresses)
    with pytest.raises(UnsafeDownloadUrl):
        await validate_download_url("https://mixed.example/image.png")


@pytest.mark.asyncio
async def test_redirect_target_is_revalidated_before_second_request():
    requests = []

    def handler(request):
        requests.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://127.0.0.1/private"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(UnsafeDownloadUrl):
            await fetch_bytes(client, "http://93.184.216.34/start", max_bytes=1024)

    assert requests == ["http://93.184.216.34/start"]


@pytest.mark.asyncio
async def test_download_size_is_enforced_while_streaming():
    def handler(request):
        return httpx.Response(200, content=b"12345", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="超过"):
            await fetch_bytes(client, "https://93.184.216.34/file", max_bytes=4)


def test_data_url_size_and_encoding_are_validated():
    assert decode_data_url("data:text/plain;base64,aGVsbG8=", max_bytes=5) == (b"hello", "text/plain")
    with pytest.raises(ValueError, match="超过"):
        decode_data_url("data:text/plain;base64,aGVsbG8=", max_bytes=4)
    with pytest.raises(ValueError, match="编码"):
        decode_data_url("data:text/plain;base64,***", max_bytes=10)
