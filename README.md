<div align="center">

<img src="./pack.png" alt="ErjcmPack追加包图标">

<h1>ErjcmPack</h1>

EricDing618's resourcepack for   
Joban Client Mod

</div>

> [!WARNING]
> **注意！JCM的文档会出现变化，本资源包可能不适用于您的JCM！** 
## 如何使用
> [!WARNING]
> 请确保您的`Joban Client Mod（JCM）`模组支持使用`JavaScript`修改其内置的`PIDS`
1. 您可以直接从 `Releases` 中下载`ErjcmPack.zip`作为资源包
2. 将`ErjcmPack.zip`放入`resourcepacks`文件夹中，并通过`Minecraft`游戏导入资源包
> [!NOTE]
> 若遇到某个`Release`没有`ErjcmPack.zip`，这时候可以直接点击`Source code (zip)`下载压缩包，提取出其中的文件夹并移动至`resourcepacks`文件夹中
3. 使用`MTR`的`刷`右键`JCM`的`PIDS`，这通常会跳出一个界面。点击 **“选择格式”栏目** 右侧的 **“选择”按钮** ，跳转到 **“显示屏格式”** 界面，并在 **“自订显示屏格式”** 中选择需要的格式。建议对照 [核心功能](#核心功能) 选择。

## 核心功能
> [!NOTE]
> 1. 列举出的都为仓库中已包含的功能，被勾选的表示可以正常使用，未被勾选的表示正在测试中。 
> 2. 请以`assets\jsblock\joban_custom_resources.json`实际注册的内容为准。 
> 3. 如有漏洞或建议，欢迎创建issue。请确保之前的issues没有报告过，并给予详细信息。
> 4. 若有具体的代码实现，欢迎创建PR。
> 5. 详细使用指南请参考 [res/guide.md](res/guide.md) 。

| 可用性 | 名称（自订显示屏格式） | 建议使用的命名空间ID | 主要文件路径 |
| :--- | :--- | :--- | :--- |
| ✅ | 中国铁路站台显示屏1 | `jsblock:pids_1a` | `assets\jsblock\scripts\cr\cr_platform_pids_1.js` |
| ✅ | 中国铁路车站大屏（投影仪） | `jsblock:pids_projector` | `assets\jsblock\scripts\cr\station_summary.js`|
| ✅ | 南京地铁站台显示屏1 | `jsblock:pids_1a` | `assets\jsblock\scripts\njmetro\njmetro_pids_1.js` |
| ❌ | 南京地铁站台显示屏2 | None | `assets\jsblock\scripts\njmetro\njmetro_pids_2.js` |

## 已知可用版本：
> [!NOTE]
> 1. 已知的可用版本并不意味着其他版本不可用。  
> 2. 您可以在`Issues`中提供更多的有用信息，并等待修改 [已知可用版本](#已知可用版本) 。 ~~作者懒，不想自己试~~
- - Minecraft 1.20.4
  - Fabric 0.16.14
  - Optifine_I7
  - JCM 2.2.3
  - MTR 4.0.5
- - Minecraft 1.20.4
  - Fabric 0.16.14
  - Optifine_I7
  - JCM 2.0.0prerelease.4
  - MTR 4.0.0prerelease.3

## 参考链接
- [https://jcm.joban.org/latest/dev/scripting/type/pids/](https://jcm.joban.org/latest/dev/scripting/type/pids/)  
- [https://www.joban.org/wiki/JCM:Building_a_Scripted_PIDS_Preset](https://www.joban.org/wiki/JCM:Building_a_Scripted_PIDS_Preset)  
- [https://jcm.joban.org/v2/dev/pids/](https://jcm.joban.org/v2/dev/pids/)


### 使用了~~亿点点~~DeepSeek