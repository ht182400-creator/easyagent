/**
 * EasyAgent NSIS 自定义安装脚本
 * 增强安装体验：版本检测、自动升级、环境检查
 */

!macro customInit
  ; 检查是否已有 EasyAgent 运行
  FindWindow $0 "" "EasyAgent"
  StrCmp $0 0 continue
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "检测到 EasyAgent 正在运行。$\r$\n请先关闭 EasyAgent 再继续安装。" IDOK closeApp IDCANCEL abort
    closeApp:
      SendMessage $0 ${WM_CLOSE} 0 0
      Sleep 2000
      Goto continue
    abort:
      Abort
  continue:
!macroend

!macro customInstall
  ; 创建卸载注册表项
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "DisplayName" "EasyAgent - AI编程助手"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "UninstallString" "$INSTDIR\Uninstall EasyAgent.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "DisplayIcon" "$INSTDIR\EasyAgent.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "Publisher" "EasyAgent Team"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "URLInfoAbout" "https://easyagent.dev"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent" \
    "NoRepair" 1
!macroend

!macro customUnInstall
  ; 清理注册表
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EasyAgent"
!macroend
