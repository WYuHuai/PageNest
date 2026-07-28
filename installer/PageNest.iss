#ifndef AppVersion
#define AppVersion "1.7.4"
#endif
#ifndef ExtensionIds
#define ExtensionIds ""
#endif

#define AppName "PageNest"
#define ServiceBundle "..\build\windows-service\PageNestService"

[Setup]
AppId={{AA28F217-D6AA-4BE2-B972-7CB201E5F84F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=PageNest Contributors

DefaultDirName={localappdata}\Programs\PageNest
DefaultGroupName=PageNest
DisableProgramGroupPage=yes
DisableDirPage=yes
LicenseFile=..\LICENSE
OutputDir=..\release\v{#AppVersion}
OutputBaseFilename=PageNest-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
SetupIconFile=PageNest.ico
UninstallDisplayIcon={app}\Service\PageNestService.exe

[Languages]
Name: "chinesesimplified"; MessagesFile: ".\ChineseSimplified.isl"

[Tasks]
Name: "startup"; Description: "登录 Windows 后自动启动 PageNest 本地服务"

[Files]
Source: "{#ServiceBundle}\*"; DestDir: "{app}\Service"; Excludes: "logs\*"; Flags: ignoreversion recursesubdirs
Source: "..\extension\*"; DestDir: "{app}\Extension"; Flags: ignoreversion recursesubdirs
Source: "..\obsidian-plugin\pagenest-viewer\main.js"; DestDir: "{code:GetViewerDirectory}"; Flags: ignoreversion
Source: "..\obsidian-plugin\pagenest-viewer\manifest.json"; DestDir: "{code:GetViewerDirectory}"; Flags: ignoreversion
Source: "..\obsidian-plugin\pagenest-viewer\styles.css"; DestDir: "{code:GetViewerDirectory}"; Flags: ignoreversion
Source: "..\obsidian-plugin\pagenest-viewer\versions.json"; DestDir: "{code:GetViewerDirectory}"; Flags: ignoreversion
Source: "extension-install.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\启动 PageNest"; Filename: "{app}\Service\PageNestService.exe"; WorkingDir: "{app}\Service"
Name: "{group}\PageNest 运行状态"; Filename: "http://127.0.0.1:8765/status"
Name: "{group}\PageNest 连接设置"; Filename: "{app}\连接设置.txt"
Name: "{group}\安装浏览器扩展"; Filename: "{app}\extension-install.html"
Name: "{group}\浏览器扩展文件夹"; Filename: "{app}\Extension"
Name: "{userstartup}\PageNest"; Filename: "{app}\Service\PageNestService.exe"; WorkingDir: "{app}\Service"; Tasks: startup

[UninstallDelete]
Type: files; Name: "{app}\Service\.env"
Type: filesandordirs; Name: "{app}\Service\logs"
Type: files; Name: "{app}\连接设置.txt"

[Run]
Filename: "{app}\extension-install.html"; Description: "查看 Edge/Chrome 扩展安装步骤"; Flags: shellexec postinstall skipifsilent unchecked

[Code]
const
  HexDigits = '0123456789abcdef';

type
  TPageNestGuid = record
    D1: Cardinal;
    D2: Word;
    D3: Word;
    D4: array[0..7] of Byte;
  end;

function CoCreateGuid(var Guid: TPageNestGuid): Integer;
  external 'CoCreateGuid@ole32.dll stdcall';

var
  VaultPage: TInputDirWizardPage;
  VaultFromCommandLine: String;
  CollectorToken: String;

function ToLowerHex(Value: Cardinal; Digits: Integer): String;
var
  Index: Integer;
begin
  Result := '';
  for Index := 1 to Digits do
  begin
    Result := Copy(HexDigits, (Value mod 16) + 1, 1) + Result;
    Value := Value div 16;
  end;
end;

function GenerateToken: String;
var
  Guid: TPageNestGuid;
  Index: Integer;
begin
  if CoCreateGuid(Guid) <> 0 then
    RaiseException('Windows 无法生成安全的 PageNest 连接令牌。');
  Result := ToLowerHex(Guid.D1, 8) + ToLowerHex(Guid.D2, 4) + ToLowerHex(Guid.D3, 4);
  for Index := 0 to 7 do
    Result := Result + ToLowerHex(Guid.D4[Index], 2);
  Result := Lowercase(Result);
end;

function SelectedVault: String;
begin
  Result := RemoveBackslashUnlessRoot(VaultPage.Values[0]);
end;

function GetViewerDirectory(Param: String): String;
begin
  Result := AddBackslash(SelectedVault) + '.obsidian\plugins\pagenest-viewer';
end;

function VaultIsValid: Boolean;
begin
  Result := DirExists(AddBackslash(SelectedVault) + '.obsidian');
end;

procedure InitializeWizard;
begin
  CollectorToken := GenerateToken;
  VaultFromCommandLine := ExpandConstant('{param:VAULT|}');
  VaultPage := CreateInputDirPage(
    wpSelectDir,
    '选择 Obsidian 知识库',
    'PageNest 会把查看器安装到这个知识库。',
    '请选择已经由 Obsidian 打开过、并且包含 .obsidian 文件夹的知识库目录，然后点击“下一步”。',
    False,
    ''
  );
  VaultPage.Add('Obsidian 知识库目录：');
  if VaultFromCommandLine <> '' then
    VaultPage.Values[0] := VaultFromCommandLine;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = VaultPage.ID) and (VaultFromCommandLine <> '');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = VaultPage.ID) and not VaultIsValid then
  begin
    MsgBox('所选目录不是有效的 Obsidian 知识库：没有找到 .obsidian 文件夹。', mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  if not VaultIsValid then
    Result := '必须通过 /VAULT 指定一个包含 .obsidian 文件夹的有效 Obsidian 知识库。'
  else
    Result := '';
end;

procedure WriteServiceConfiguration;
var
  Lines: TArrayOfString;
  ConnectionLines: TArrayOfString;
  ExtensionLines: TArrayOfString;
  VaultValue: String;
  ConfigPath: String;
begin
  VaultValue := SelectedVault;
  StringChangeEx(VaultValue, '\', '/', True);
  SetArrayLength(Lines, 4);
  Lines[0] := 'OBSIDIAN_VAULT_PATH="' + VaultValue + '"';
  Lines[1] := 'LOCAL_COLLECTOR_TOKEN=' + CollectorToken;
  Lines[2] := 'ALLOW_LOCAL_NETWORK_DOWNLOADS=false';
  Lines[3] := 'PAGENEST_EXTENSION_IDS={#ExtensionIds}';
  ConfigPath := ExpandConstant('{app}\Service\.env');
  if not SaveStringsToUTF8FileWithoutBOM(ConfigPath, Lines, False) then
    RaiseException('无法写入 PageNest 本地服务配置。');
  SetArrayLength(ExtensionLines, 1);
  ExtensionLines[0] := 'globalThis.PAGENEST_CONNECTION = Object.freeze({server: "http://127.0.0.1:8765", token: "' + CollectorToken + '"});';
  if not SaveStringsToUTF8FileWithoutBOM(
    ExpandConstant('{app}\Extension\connection-config.js'),
    ExtensionLines,
    False
  ) then
    RaiseException('无法写入 PageNest 扩展自动连接配置。');
  SetArrayLength(ConnectionLines, 4);
  ConnectionLines[0] := 'PageNest 浏览器扩展连接设置';
  ConnectionLines[1] := '';
  ConnectionLines[2] := '服务地址：http://127.0.0.1:8765';
  ConnectionLines[3] := '连接令牌：' + CollectorToken;
  if not SaveStringsToUTF8FileWithoutBOM(
    ExpandConstant('{app}\连接设置.txt'),
    ConnectionLines,
    False
  ) then
    RaiseException('无法写入 PageNest 扩展连接设置。');
end;

function ServiceIsHealthy: Boolean;
var
  Http: Variant;
  ResponseText: String;
  StatusCode: Integer;
begin
  Result := False;
  try
    Http := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    Http.Open('GET', 'http://127.0.0.1:8765/api/health', False);
    Http.SetRequestHeader('Authorization', 'Bearer ' + CollectorToken);
    Http.SetTimeouts(1000, 1000, 1000, 2000);
    Http.Send('');
    StatusCode := Http.Status;
    ResponseText := Http.ResponseText;
    Result := (StatusCode = 200) and (Pos('"ok":true', ResponseText) > 0);
  except
    Result := False;
  end;
end;

procedure StartAndVerifyService;
var
  ResultCode: Integer;
  Attempt: Integer;
begin
  if WizardSilent or (ExpandConstant('{param:NOSTART|0}') = '1') then
    Exit;
  if not Exec(
    ExpandConstant('{app}\Service\PageNestService.exe'),
    '',
    ExpandConstant('{app}\Service'),
    SW_HIDE,
    ewNoWait,
    ResultCode
  ) then
  begin
    MsgBox('PageNest 已安装，但本地服务未能启动。请从开始菜单再次启动。', mbError, MB_OK);
    Exit;
  end;
  for Attempt := 1 to 20 do
  begin
    Sleep(500);
    if ServiceIsHealthy then
      Exit;
  end;
  MsgBox(
    'PageNest 已安装，但未能通过本地服务健康检查。请确认 127.0.0.1:8765 没有被其他程序占用。',
    mbError,
    MB_OK
  );
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    WriteServiceConfiguration;
    StartAndVerifyService;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption :=
      'PageNest 已安装，浏览器扩展连接信息已经预配置。' + #13#10 + #13#10 +
      '接下来安装 Edge/Chrome 扩展，并在 Obsidian 的第三方插件中启用 PageNest Viewer。';
end;
