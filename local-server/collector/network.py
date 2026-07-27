import asyncio
import base64
import binascii
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import unquote_to_bytes, urljoin, urlsplit

import httpx

from .limits import MAX_DOWNLOAD_REDIRECTS


BLOCKED_METADATA_HOSTS = {"metadata.google.internal"}
BLOCKED_METADATA_ADDRESSES = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("169.254.170.2"),
    ipaddress.ip_address("fd00:ec2::254"),
}
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


class UnsafeDownloadUrl(ValueError):
    pass


@dataclass(frozen=True)
class Download:
    body: bytes
    content_type: str
    final_url: str


async def _resolve_addresses(host: str, port: int) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        records = await asyncio.to_thread(
            socket.getaddrinfo,
            host,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise UnsafeDownloadUrl("下载地址无法解析") from exc
    return {ipaddress.ip_address(record[4][0].split("%", 1)[0]) for record in records}


def _local_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return address.is_private or address.is_loopback or address.is_link_local


def _address_allowed(address, allow_local_networks: bool) -> bool:
    if address in BLOCKED_METADATA_ADDRESSES:
        return False
    if address.is_global:
        return True
    return allow_local_networks and _local_address(address)


async def validate_download_url(url: str, *, allow_local_networks: bool = False) -> str:
    try:
        parts = urlsplit(url)
        port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    except ValueError as exc:
        raise UnsafeDownloadUrl("下载地址端口无效") from exc
    host = (parts.hostname or "").rstrip(".").lower()
    if parts.scheme.lower() not in {"http", "https"} or not host:
        raise UnsafeDownloadUrl("只允许下载 http/https 地址")
    if parts.username or parts.password:
        raise UnsafeDownloadUrl("下载地址不能包含账号信息")
    if host in BLOCKED_METADATA_HOSTS:
        raise UnsafeDownloadUrl("禁止访问云元数据地址")

    try:
        addresses = {ipaddress.ip_address(host.split("%", 1)[0])}
    except ValueError:
        addresses = await _resolve_addresses(host, port)
    if not addresses or any(not _address_allowed(address, allow_local_networks) for address in addresses):
        raise UnsafeDownloadUrl("下载地址指向受保护的本机或内网")
    return url


def decode_data_url(value: str, *, max_bytes: int) -> tuple[bytes, str]:
    try:
        header, encoded = value.split(",", 1)
    except ValueError as exc:
        raise ValueError("Data URL 格式无效") from exc
    if not header.lower().startswith("data:"):
        raise ValueError("不是 Data URL")
    mime = header[5:].split(";", 1)[0]
    try:
        body = (
            base64.b64decode("".join(encoded.split()), validate=True)
            if ";base64" in header.lower()
            else unquote_to_bytes(encoded)
        )
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Data URL 编码无效") from exc
    if len(body) > max_bytes:
        raise ValueError(f"Data URL 超过 {max_bytes} 字节限制")
    return body, mime


async def fetch_bytes(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    allow_local_networks: bool = False,
) -> Download:
    current = url
    for _ in range(MAX_DOWNLOAD_REDIRECTS + 1):
        await validate_download_url(current, allow_local_networks=allow_local_networks)
        async with client.stream("GET", current, follow_redirects=False) as response:
            if response.status_code in REDIRECT_STATUSES:
                location = response.headers.get("location")
                if not location:
                    raise UnsafeDownloadUrl("下载重定向缺少目标地址")
                current = urljoin(current, location)
                continue
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > max_bytes:
                raise ValueError(f"下载内容超过 {max_bytes} 字节限制")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise ValueError(f"下载内容超过 {max_bytes} 字节限制")
            return Download(
                body=bytes(body),
                content_type=response.headers.get("content-type", "").split(";", 1)[0],
                final_url=str(response.url),
            )
    raise UnsafeDownloadUrl("下载重定向次数过多")
