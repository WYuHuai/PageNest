import os
import subprocess
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path

from .config import save_vault_configuration, settings
from .vault import DEFAULT_CATEGORY, list_vault_folders


class VaultSelectionError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


_SELECTION_LOCK = threading.Lock()
_PICKER_SCRIPT = r"""
param([string]$OutputFile, [string]$InitialPath)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "选择 Obsidian Vault"
$dialog.ShowNewFolderButton = $false
if ($InitialPath -and (Test-Path -LiteralPath $InitialPath -PathType Container)) {
    $dialog.SelectedPath = $InitialPath
}
$result = $dialog.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputFile, $dialog.SelectedPath, $utf8)
"""


def open_windows_vault_picker(initial_path: Path | None = None) -> Path | None:
    if os.name != "nt":
        raise VaultSelectionError("当前系统无法打开 Windows 文件夹选择器。", 500)
    powershell = (
        Path(os.environ.get("SystemRoot", r"C:\Windows"))
        / "System32"
        / "WindowsPowerShell"
        / "v1.0"
        / "powershell.exe"
    )
    if not powershell.is_file():
        raise VaultSelectionError("无法打开文件夹选择器，请重新启动 PageNest 后再试。", 500)
    with tempfile.TemporaryDirectory(prefix="pagenest-vault-picker-") as temporary:
        root = Path(temporary)
        script = root / "select-vault.ps1"
        output = root / "selected.txt"
        script.write_text(_PICKER_SCRIPT, encoding="utf-8-sig")
        command = [
            str(powershell),
            "-NoProfile",
            "-NonInteractive",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
            "-OutputFile",
            str(output),
            "-InitialPath",
            str(initial_path or ""),
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except OSError as exc:
            raise VaultSelectionError("无法打开文件夹选择器，请重新启动 PageNest 后再试。", 500) from exc
        if completed.returncode == 2:
            return None
        if completed.returncode != 0 or not output.exists():
            raise VaultSelectionError("无法打开文件夹选择器，请重新启动 PageNest 后再试。", 500)
        selected = output.read_text("utf-8").strip()
        return Path(selected) if selected else None


def validate_vault_path(selected: Path) -> Path:
    try:
        vault = selected.expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise VaultSelectionError("选择的文件夹不存在，请重新选择。") from exc
    if not vault.is_dir():
        raise VaultSelectionError("选择的路径不是文件夹，请重新选择。")
    if not (vault / ".obsidian").is_dir():
        raise VaultSelectionError("这个文件夹似乎不是 Obsidian Vault，没有找到 .obsidian 文件夹。")

    probe: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=vault,
            prefix=".pagenest-write-check-",
            suffix=".tmp",
            delete=False,
        ) as handle:
            probe = Path(handle.name)
            handle.write(b"PageNest write check")
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise VaultSelectionError("无法使用这个文件夹，请确认 PageNest 有写入权限。") from exc
    finally:
        if probe is not None:
            try:
                probe.unlink(missing_ok=True)
            except OSError as exc:
                raise VaultSelectionError("无法使用这个文件夹，请确认 PageNest 有写入权限。") from exc
    return vault


def switch_vault(
    picker: Callable[[Path | None], Path | None] = open_windows_vault_picker,
) -> dict:
    """Run one user-initiated selection without accepting a client-supplied path."""
    with _SELECTION_LOCK:
        selected = picker(settings.vault)
        if selected is None:
            return {"ok": True, "cancelled": True}
        vault = validate_vault_path(selected)
        try:
            save_vault_configuration(vault)
        except OSError as exc:
            raise VaultSelectionError("无法保存仓库设置，请确认 PageNest 配置目录可写。", 500) from exc
        return {
            "ok": True,
            "cancelled": False,
            "vault_name": vault.name,
            "default": DEFAULT_CATEGORY,
            "folders": list_vault_folders(vault),
        }
