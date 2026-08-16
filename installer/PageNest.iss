#ifndef AppVersion
#define AppVersion "1.9.0"
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
AppPublisher=WYuHuai

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
Name: "{group}\PageNest 运行状态"; Filename: "{code:GetServiceStatusUrl}"
Name: "{group}\PageNest 连接设置"; Filename: "{app}\连接设置.txt"
Name: "{group}\安装浏览器扩展"; Filename: "{app}\extension-install.html"
Name: "{group}\浏览器扩展文件夹"; Filename: "{app}\Extension"
Name: "{userstartup}\PageNest"; Filename: "{app}\Service\PageNestService.exe"; WorkingDir: "{app}\Service"

[UninstallDelete]
Type: files; Name: "{app}\Service\.env"
Type: filesandordirs; Name: "{app}\Service\logs"
Type: files; Name: "{app}\连接设置.txt"

[Run]
Filename: "{app}\extension-install.html"; Description: "查看 Edge/Chrome 扩展安装步骤"; Flags: shellexec postinstall skipifsilent
Filename: "{app}\Extension"; Description: "打开正确的浏览器扩展文件夹"; Flags: shellexec postinstall skipifsilent nowait

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
  ServicePort: Integer;

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

function IsCollectorToken(Value: String): Boolean;
var
  Index: Integer;
begin
  Result := Length(Value) = 32;
  if not Result then
    Exit;
  for Index := 1 to Length(Value) do
    if Pos(Lowercase(Copy(Value, Index, 1)), HexDigits) = 0 then
    begin
      Result := False;
      Exit;
    end;
end;

function ExistingCollectorToken: String;
var
  Lines: TArrayOfString;
  Index: Integer;
  Value: String;
  ConfigPath: String;
begin
  Result := '';
  ConfigPath := ExpandConstant('{app}\Service\.env');
  if not LoadStringsFromFile(ConfigPath, Lines) then
    Exit;
  for Index := 0 to GetArrayLength(Lines) - 1 do
    if Pos('LOCAL_COLLECTOR_TOKEN=', Lines[Index]) = 1 then
    begin
      Value := Trim(Copy(Lines[Index], Length('LOCAL_COLLECTOR_TOKEN=') + 1, MaxInt));
      if (Length(Value) >= 2) and (Copy(Value, 1, 1) = '"') and
         (Copy(Value, Length(Value), 1) = '"') then
        Value := Copy(Value, 2, Length(Value) - 2);
      if IsCollectorToken(Value) then
        Result := Lowercase(Value);
      Exit;
    end;
end;

function ExistingServicePort: Integer;
var
  Lines: TArrayOfString;
  Index: Integer;
  Value: Integer;
begin
  Result := 0;
  if not LoadStringsFromFile(ExpandConstant('{app}\Service\.env'), Lines) then
    Exit;
  for Index := 0 to GetArrayLength(Lines) - 1 do
    if Pos('PAGENEST_PORT=', Lines[Index]) = 1 then
    begin
      Value := StrToIntDef(Trim(Copy(Lines[Index], Length('PAGENEST_PORT=') + 1, MaxInt)), 0);
      if (Value = 8765) or (Value = 18765) or (Value = 28765) then
        Result := Value;
      Exit;
    end;
end;

function ExistingConfigLine(Prefix: String): String;
var
  Lines: TArrayOfString;
  Index: Integer;
begin
  Result := '';
  if not LoadStringsFromFile(ExpandConstant('{app}\Service\.env'), Lines) then
    Exit;
  for Index := 0 to GetArrayLength(Lines) - 1 do
    if Pos(Prefix, Lines[Index]) = 1 then
    begin
      Result := Lines[Index];
      Exit;
    end;
end;

function PortIsListening(Lines: TArrayOfString; Port: Integer): Boolean;
var
  Index: Integer;
  Marker: String;
begin
  Result := False;
  Marker := ':' + IntToStr(Port) + ' ';
  for Index := 0 to GetArrayLength(Lines) - 1 do
    if (Pos(Marker, Lines[Index]) > 0) and
       (Pos('LISTENING', Uppercase(Lines[Index])) > 0) then
    begin
      Result := True;
      Exit;
    end;
end;

function SelectServicePort: Integer;
var
  Lines: TArrayOfString;
  OutputPath: String;
  ResultCode: Integer;
begin
  Result := 0;
  OutputPath := ExpandConstant('{tmp}\pagenest-netstat.txt');
  if not Exec(
    ExpandConstant('{cmd}'),
    '/C netstat -ano -p TCP > "' + OutputPath + '"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) or (ResultCode <> 0) or not LoadStringsFromFile(OutputPath, Lines) then
    Exit;
  DeleteFile(OutputPath);

  if not PortIsListening(Lines, 8765) then
    Result := 8765
  else if not PortIsListening(Lines, 18765) then
    Result := 18765
  else if not PortIsListening(Lines, 28765) then
    Result := 28765;
end;

function GetServiceBaseUrl: String;
begin
  Result := 'http://127.0.0.1:' + IntToStr(ServicePort);
end;

function GetServiceStatusUrl(Param: String): String;
begin
  Result := GetServiceBaseUrl + '/status';
end;

procedure InitializeWizard;
begin
  CollectorToken := '';
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

function ServiceIsHealthy: Boolean; forward;

function StopInstalledService: Boolean;
var
  ResultCode: Integer;
  ServicePath: String;
  ScriptPath: String;
  Lines: TArrayOfString;
begin
  ServicePath := ExpandConstant('{app}\Service\PageNestService.exe');
  ScriptPath := ExpandConstant('{tmp}\stop-pagenest-service.ps1');
  SetArrayLength(Lines, 5);
  Lines[0] := 'param([Parameter(Mandatory=$true)][string]$TargetPath)';
  Lines[1] := '$target = [IO.Path]::GetFullPath($TargetPath)';
  Lines[2] := 'Get-CimInstance Win32_Process -Filter "Name=''PageNestService.exe''" |';
  Lines[3] := '  Where-Object { $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath) -eq $target) } |';
  Lines[4] := '  ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }';
  if not SaveStringsToUTF8FileWithoutBOM(ScriptPath, Lines, False) then
  begin
    Result := False;
    Exit;
  end;
  Result := Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ScriptPath +
      '" -TargetPath "' + ServicePath + '"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) and (ResultCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  if not VaultIsValid then
    Result := '必须通过 /VAULT 指定一个包含 .obsidian 文件夹的有效 Obsidian 知识库。'
  else begin
    if CollectorToken = '' then
    begin
      CollectorToken := ExistingCollectorToken;
      if CollectorToken = '' then
        CollectorToken := GenerateToken;
    end;
    ServicePort := ExistingServicePort;
    if (ServicePort = 0) or not ServiceIsHealthy then
      ServicePort := SelectServicePort;
    if ServicePort = 0 then
      Result := 'PageNest 无法找到可用的本地端口（已检查 8765、18765 和 28765）。请关闭占用这些端口的程序后重试。'
    else if StopInstalledService then
      Result := ''
    else
      Result := 'PageNest could not stop the running local service. Close PageNest and try again.';
  end;
end;

procedure WriteServiceConfiguration;
var
  Lines: TArrayOfString;
  ConnectionLines: TArrayOfString;
  ExtensionLines: TArrayOfString;
  VaultValue: String;
  ConfigPath: String;
  ApiUrlLine: String;
  ModelLine: String;
  ApiKeyLine: String;
  LineCount: Integer;
begin
  ApiUrlLine := ExistingConfigLine('HERMES_API_URL=');
  ModelLine := ExistingConfigLine('HERMES_MODEL_NAME=');
  ApiKeyLine := ExistingConfigLine('HERMES_API_KEY=');
  VaultValue := SelectedVault;
  StringChangeEx(VaultValue, '\', '/', True);
  LineCount := 5;
  if ApiUrlLine <> '' then LineCount := LineCount + 1;
  if ModelLine <> '' then LineCount := LineCount + 1;
  if ApiKeyLine <> '' then LineCount := LineCount + 1;
  SetArrayLength(Lines, LineCount);
  Lines[0] := 'OBSIDIAN_VAULT_PATH="' + VaultValue + '"';
  Lines[1] := 'LOCAL_COLLECTOR_TOKEN=' + CollectorToken;
  Lines[2] := 'ALLOW_LOCAL_NETWORK_DOWNLOADS=false';
  Lines[3] := 'PAGENEST_EXTENSION_IDS={#ExtensionIds}';
  Lines[4] := 'PAGENEST_PORT=' + IntToStr(ServicePort);
  LineCount := 5;
  if ApiUrlLine <> '' then begin Lines[LineCount] := ApiUrlLine; LineCount := LineCount + 1; end;
  if ModelLine <> '' then begin Lines[LineCount] := ModelLine; LineCount := LineCount + 1; end;
  if ApiKeyLine <> '' then Lines[LineCount] := ApiKeyLine;
  ConfigPath := ExpandConstant('{app}\Service\.env');
  if not SaveStringsToUTF8FileWithoutBOM(ConfigPath, Lines, False) then
    RaiseException('无法写入 PageNest 本地服务配置。');
  SetArrayLength(ExtensionLines, 1);
  ExtensionLines[0] := 'globalThis.PAGENEST_CONNECTION = Object.freeze({server: "' + GetServiceBaseUrl + '", token: "' + CollectorToken + '"});';
  if not SaveStringsToUTF8FileWithoutBOM(
    ExpandConstant('{app}\Extension\connection-config.js'),
    ExtensionLines,
    False
  ) then
    RaiseException('无法写入 PageNest 扩展自动连接配置。');
  SetArrayLength(ConnectionLines, 4);
  ConnectionLines[0] := 'PageNest 浏览器扩展连接设置';
  ConnectionLines[1] := '';
  ConnectionLines[2] := '服务地址：' + GetServiceBaseUrl;
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
    Http.Open('GET', GetServiceBaseUrl + '/api/health', False);
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
  if ExpandConstant('{param:NOSTART|0}') = '1' then
    Exit;
  if ServiceIsHealthy then
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
    'PageNest 已安装，但未能通过本地服务健康检查。已选择的服务地址是 ' + GetServiceBaseUrl + '。',
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
      '点击完成后会打开正确的 Extension 文件夹和安装说明。' + #13#10 +
      '请勿加载下载的源码目录，否则扩展无法连接本机服务。';
end;
