# DSH A：真实设置页预览（2026-11-09）

## 当前状态：连接配置备份与恢复组件重设计

用户指出“可用配置”用途不清、每页重复，并要求重新设计。当前构建 `zcode-backend-settings-refresh.202611091642` 将其改为只在DSH连接页底部出现的“连接配置备份与恢复”。收起时显示尚无备份／备份时间，展开后明确用途、四连接字段范围、排除项、当前库单份备份替换与生效边界。按钮按状态显示备份当前配置／更新备份和恢复备份；无备份时恢复禁用，操作中同时禁用，成功后立即更新状态，失败沿用原存储回滚并显示通用局部提示。去掉外部来源行、额外横线及70ch限制，使用一层全宽主题边框。其他三个DSH子页不再显示bar，workspace标记和缺程序提示保留；其他后端保持原入口。

修改前CodeGraph：共享render有1个直接method/function调用者，depth1为4节点／4边；DSHrenderTab有2个直接调用者，depth1为3节点／2边，均在本次设置范围。快照allowlist/schema、capture/read/save/restore函数不变。五个聚焦suite59项测试、全仓零警告lint、typecheck、模块文档、源图新鲜度和构建通过。四文件部署哈希一致，真实独立Settings回读1642。

实机原生输入已验证保存→状态时间更新／启用恢复→权威存储四字段读回→其余三页无入口→返回连接保留备份→恢复同配置不改变后端设置hash。五张实际截图覆盖空收起／空展开／已备份展开／浅色／窄窗口。测试产生的备份已移除，存储确认不存在，原页面、主题、窗口和配置恢复。两次只读CLI回读超时后均先确认恢复，保留原构建身份的已完成证据，只补两张剩余截图。独立custom-subagent直接查看五张组件图及限定代码，结论SHIP：用途／状态／范围清楚，一层全宽frame，明暗与窄窗无裁切；pending／失败仅代码审阅，不冒称实机截图覆盖。详见 `connection-backup-review.md`。未重跑全量suite，未提交、推送或发布。证据 `connection-backup-{before,after}-runtime.json`、`connection-backup-*.png`、`connection-backup-deployment.json`、`connection-backup-validation.json`。

## 此前状态：DSH 右侧控件垂直居中

用户指出右侧按钮应相对左侧完整标题／说明组居中。当前构建为 `zcode-backend-settings-refresh.202611091611`。仅改两个DSH样式声明：控件grid item设置align-self:center，说明区padding-top从5px归零；父row仍为start，较高编辑器不会把左侧文字拉到中部，窄栏仍上下堆叠并左对齐。原生默认值页按钮原比文字组中心高约11.2px；修复后的四个原生截图状态中七个同行控件的最大中心偏差0.00390625px，窄栏堆叠断言通过。独立custom-subagent查看三张新图，确认读取配置／路径下拉／测试连接居中、无重叠裁切，结论PASS。窗口、主题、原configuration子页／折叠状态及配置哈希恢复。

反向还原两个声明后精确匹配1557指纹，证明标题字号、宽度、导航、颜色和TypeScript均未改变。构建、模块文档、源图新鲜度通过，四部署文件哈希一致，运行1611已回读；TypeScript沿用同源码1557的fresh typecheck，不冒称重跑。证据为 `control-alignment-{before,after}-runtime.json`、`control-alignment-*.png`、`control-alignment-deployment.json`、`control-alignment-validation.json`、`control-alignment-review.md`。未提交、推送或发布。

## 此前状态：DSH 配置项标题层级

用户指出每项配置标题不够突出，并明确要求从本地 `my-skills` 查询Claude设计参考、不要登录Claude。已阅读Anthropic官方品牌／通用前端设计指导及参考级Claude营销页分析；这些资料没有官方应用设置项字号规范，具体数值为对DSH的局部适配。当前构建 `zcode-backend-settings-refresh.202611091557`：普通配置名13px/550→15px/600，说明保持12px/400、间距5→6px；折叠标题14px/600，展开子项13px/600，选中MCP服务器名16px/600。页首25px衬线标题、主题颜色、宽度、导航和表单网格保持。

七个原生独立Settings截图状态覆盖四个子页、空HTTP编辑草稿、明暗连接页和800px窗口。实测标题字号／字重符合上述层级，无横向溢出；主题、窗口、原connection选择／折叠状态及配置哈希恢复。独立custom-subagent查看五张新图和一张基线图，确认标题更易扫描、子项层级清楚、明暗与窄栏无重叠或裁切，结论PASS。另行对当前连接页两种主题的实际半透明背景逐层合成，标题／说明对比度最低8.93:1。构建、typecheck、模块文档与源图新鲜度通过，四部署文件哈希一致，运行BUILD_ID回读1557。反向还原五段排版样式后精确匹配修改前指纹，证明没有其他运行源码变化。

参考及证据：`field-title-reference.md`、`field-title-{before,after}-runtime.json`、`field-title-*.png`、`field-title-color-runtime.json`、`field-title-deployment.json`、`field-title-validation.json`、`field-title-review.md`。截图脚本对原生默认值页标题结构及主题命令文本输出的假设已修正；错误后先确认状态恢复，再补未完成状态。初始背景颜色解析不适用于带alpha的CSS color(srgb)，已改为实际Canvas合成后计算，不采用初始结果。未重跑全量测试，未提交、推送或发布。

## 此前状态：整个设置内容区自适应宽度

用户第二个问题要求整个 OpenCodian 设置内容随窗口变宽。当前 Test Vault 构建为 `zcode-backend-settings-refresh.202611091537`。只在公共 `settings-layout-contract.css` 新增一条带插件根标记的宿主规则：group上限700→1160px，重算继承的居中偏移，保留16–32px最小侧留白。普通内容最高约1120px，DSH保留1030px上限，均随较窄窗口收缩；原有表单网格与1523导航修复未改。全运行源码指纹核对只有该公共CSS变化，TypeScript与DSH样式相同。

1920／1440／1000／800px原生独立窗口实测：普通内容1120／1092.4／670／528px，DSH1030／1030／670／528px；八个实际截图状态均无内容横向溢出、左右留白差不超过1px。General／Conversation／UI具有相同公共根宽；原生编辑器设置页仍为700px组上限，样式未越界。编辑区设置维持原1102px根／1006px内容宽度。配置哈希、主题、原窗口bounds／最大化状态和General／Basic选择恢复。构建、typecheck、模块文档与源图新鲜度通过，四文件部署哈希一致，重载后回读1537。独立custom-subagent实际审阅四张宽／窄截图，认为左右关联、居中、换行、导航和无裁切均通过，结论PASS。

证据为 `settings-width-{before,after}-runtime.json`、`settings-width-{before,after}-*.png`、`settings-width-deployment.json`、`settings-width-validation.json`、`settings-width-review.md`。基线八张已完成且恢复，额外UI几何探针曾因该页没有二级导航触发探针错误，已修正空导航处理，修复后完整探针exit0；不将该探针错误当作产品问题或伪称基线脚本全绿。未重跑全量测试，未提交、推送或发布；未恢复被停止的HTML或列对齐试验。

## 此前状态：DSH 两层导航间距修复

用户提出第一个局部问题：点击 DSH 后，一级标签与二级标签的间距和布局不同于其他设置标签。当前构建为 `zcode-backend-settings-refresh.202611091523`。仅把 DSH 排除在后端专用的 42px／6px block padding／强制单行导航规则之外，直接继承通用导航布局；未改设置正文。全量运行源码指纹对比证明只改变一个 CSS 选择器和注释，TypeScript 与恢复后的 1501 相同。四个部署文件 SHA-256 一致，重载后独立 Settings 窗口回读新 BUILD_ID。

实机通过原生鼠标切换通用、DSH、会话，并在 1920px 和 800px 独立窗口截图、测量。宽窗口下 DSH 一级／二级栏均从42px恢复为30px，二级栏 y 从140px回到与通用相同的128px；栏间距保持12px。800px窗口中通用与DSH一级栏均自然换行为66px，二级栏 y 均为164px、高30px。通用和会话的导航／内容壳几何与修改前相同；配置哈希、主题、原窗口 bounds／最大化状态以及用户原通用／基础选择均恢复。证据为 `navigation-{before,after}-runtime.json`、`navigation-{before,after}-*.png` 和 `navigation-deployment.json`。构建、typecheck、模块文档、graphify新鲜度、diff空白检查通过；未将历史全量测试计数冒充本轮重跑。机械检测的字体／圆角／字号提示均位于原样保留的既有正文样式，本轮没有引入这些属性。独立 custom-subagent 实际查看五张修复后截图及两张修复前对照，确认宽／窄导航位置一致、换行清楚、无标签重叠或裁切，结论 PASS，见 `navigation-review.md`。未提交、推送或发布。

## 此前状态：按用户要求恢复原格式

用户明确要求停止 HTML、先恢复测试库源码。已撤回此后的无限宽度、1200px 宿主覆盖和左右列对齐试改；源码 CSS 与生成 styles.css 的 SHA-256 均精确匹配 `zcode-backend-settings-refresh.202611091338`。保留该版的紧凑操作、自然文宽、留白分组、主题颜色和单层折叠框。当前重新构建并部署为 `zcode-backend-settings-refresh.202611091501`，四个文件 SHA-256 与部署产物一致，实际独立 Settings 窗口已回读该 BUILD_ID；宿主恢复700px组行为、DSH恢复1030px最大值，临时480px列宽／34px标签槽已移除。源图摘要重新匹配1338的 `58dc972867e783e0ffeb27012251c52462f6b2a0e48ae9f81fd0d2a4fc620e79`。停止新的 HTML 或布局试改；未提交、推送或发布。证据 `restore-original-deployment.json`。

以下均为先前各轮历史记录，不代表仍在运行的版本。

## 当前补充：紧凑按钮、自然文宽与留白分组

当前 Test Vault 构建为 `zcode-backend-settings-refresh.202611091338`。用户指出按钮不必要地拉满、页首说明提前换行、每个选项的横线过多且层级碎。本轮统一 DSH 四页的 CSS：纯操作控件按内容宽度横向排列并允许换行，文本框／下拉／分段控件保留各自宽度；取消 DSH 说明文字的固定 ch 限宽，正文在可用容器内自然换行；普通设置行不再逐项画横线，采用 16px 行内边距与 24px 任务间隔分组，仅保留恢复区之前的主要边界和已选定的单层折叠外框。未改 TypeScript、保存逻辑、配置或其他后端。

布局检测在修改前后均无机械性提示；实际验收覆盖四页宽栏和 390px 内容栏、MCP 中等栏宽与浅色、临时新增 HTTP 本地草稿后的有内容表单和现有自定义下拉。最终截图与逐行按钮宽度／intro 宽度／无逐行边框断言记录在 `spacing-final-*.png`、`spacing-final-runtime.json`（12 个状态，包含有服务器草稿的宽／窄栏）。1320 首轮截图与 `spacing-runtime.json` 保留其原构建身份，不用来冒充最终新图。检查结束恢复用户原来的原生默认值页、主题、视口、滚动位置和开合状态；没有保存草稿。首次窄栏脚本错误地把窗口宽度当作内容宽度，在用户展开侧栏时只剩 90px，恢复前先回读并还原原视口／子页，再修正为按内容区实测 390px 的验收，不将该错误探针作为产品截图或通过证据。

首轮独立视觉审阅给出 FIX：请求头“添加变量”仍全宽，服务器字段与全局操作边界不足，中等栏宽操作说明仍偏窄。最终补齐所有 env/header 子操作的内容宽度，选中服务器标签为 15px/600，其字段缩进 20px、后留 32px 再进入全局操作；纯按钮任务行在内容栏低于 740px 时提前堆叠。实测 Add variable 为 76px，所属关系与无横向溢出的断言通过。两个生产 TypeScript 文件指纹与之前 1302 的 41 项测试／typecheck 版本一致；本轮 CSS-only 使用构建、源图／模块文档和实际 DOM／输入证据，不声称重跑全量测试。最终 1338 的十个画面取得后遇到一次只读 CLI eval 超时，已确认恢复；后续复用同构建已完成的八个宽／窄页证据，补完其余场景并再次证明恢复，不重跑已完成检查。首轮审阅记录见 `spacing-initial-review.md`。第二轮同一独立审阅者实际查看五张新图，确认嵌套操作、服务器字段归属、页面级操作边界和中等栏宽说明布局均已解决，结论为本轮用户预览 PASS；详见 `spacing-final-review.md`。最终十二张截图的哈希、无逐行边框、按钮宽度和恢复状态已另行核对，记录于 `spacing-final-validation.json`、`spacing-final-measurements.json`，不代表多服务器或所有后端功能的全面验收。

## 此前补充：补齐 MCP 原始 JSON 面板

该轮 Test Vault 构建为 `zcode-backend-settings-refresh.202611091302`。用户指出 MCP 原始 JSON 仍显示旧三角标题和左右窄列；前一轮遗漏了 `.opencodian-dsh-mcp-raw`。本轮列举并统一全部四类 DSH disclosure（启动高级项、可用默认值恢复、MCP 历史恢复、原始 JSON），将 raw 纳入外框、header、chevron、窄栏和强制颜色选择器。`renderMcpRawEditor` 使用现有 body 容器，服务器声明采用名称／说明在上、全宽等宽字体编辑器在下的单列布局，取消介绍文字的 48ch 限宽。JSON draft、onChange、保存、校验和应用逻辑不变。

实机通过原生鼠标展开 raw，深色、浅色和 390px 栏宽直接 CDP 截图，验证编辑器在说明下方、使用完整行宽、未越出面板；另外遍历 MCP 页与连接页，确认四类折叠区都有 1px 四边外框、flex header、隐藏原生 marker 和右侧 SVG chevron。MCP 草稿与保存值均为空数组，验证过程中未编辑 JSON 或保存；原 MCP 页、滚动位置、主题、视口和面板开合状态已恢复。证据为 `mcp-json-full-width-{dark,light,narrow}.png`、`mcp-json-layout-runtime.json`。

本次重新运行 4 个 focused suite／41 项测试、typecheck、MCP workspace 零警告 lint、模块文档、源图新鲜度与生产构建，均通过。四文件部署 SHA-256 一致，运行 BUILD_ID 已回读。CodeGraph 修改前 `SettingsDshMcpWorkspace::renderMcpRawEditor` 有 1 个直接 method 调用者，depth 1 返回同文件 2 个节点；修改后已 sync 与 affected 检查。独立 custom-subagent 实际审阅深色、浅色和窄栏三张新图，确认外框、右侧箭头、介绍在上／编辑器全宽在下的层级与主题连续，无实质视觉阻塞；详见 `mcp-json-layout-review.md`。

## 此前补充：风险说明使用完整面板宽度

该轮 Test Vault 构建为 `zcode-backend-settings-refresh.202611091253`。风险说明误继承字段帮助文字的 `max-width:48ch`，实际只有 362.8px，导致宽面板中提前换行。仅对高级区直属说明取消这一限宽：1030px 面板内实际可用 900px，文字显示一行；390px 面板内为 324px，文字自然换成两行，未使用 nowrap、无横向溢出。真实鼠标打开后直接 CDP 截图，DOM Range 统计行数；验证后恢复用户原先的 MCP 子标签、主题与视口。证据为 `warning-measure-{wide,narrow}.png`、`warning-measure-runtime.json`。构建、四文件部署 hash、模块文档和源图新鲜度通过；生产 TypeScript 未改。

## 此前补充：shadcn 风格的单层折叠面板

该轮 Test Vault 构建为 `zcode-backend-settings-refresh.202611091222`。用户提供 shadcn/ui 官方 Collapsible、Accordion 与带边框 Accordion 截图后，确认采用独立 Collapsible 行为配单层外框。此轮仅调整 DSH CSS：启动高级项、可用默认值恢复和 MCP 恢复的标题与内容共用一层 1px 主题边框，整行 summary 可点击，右侧 SVG chevron 随开合翻转。内容区内边距与标题对齐，背景透明，移除上一轮的左引导线、额外缩进和淡底色；环境变量与添加操作仍保持正确归属。

原生 details/summary 语义保持。官方 CLI 原生鼠标输入在标题最右侧打开，Space 关闭、带字符事件的 Enter 打开，多个面板可独立展开。初次 Enter 探针只发送键事件未产生原生激活；补齐标准字符事件后通过，未改产品键盘逻辑。高对比度模式下 chevron mask 和系统前景色可见。深色、浅色、390px 内容栏及恢复面板的直接 CDP 截图均已取得，主题／视口／面板开合状态前后实际比较一致。证据为 `collapsible-frame-{collapsed,dark,light,narrow,recovery}.png`、`collapsible-frame-runtime.json`。

本轮构建、四文件部署 hash、模块文档与源图新鲜度检查通过。TypeScript、配置保存与事件逻辑未修改，之前 1209 的 41 项 focused tests／typecheck 仅按同源码复用，不冒充本轮重跑。当前验证侧重实际渲染、原生鼠标／键盘和主题恢复。独立 custom-subagent 实际审阅五张新图，确认单层外框、右侧开合箭头、主题连续和窄栏适配，可交付本轮用户预览。键盘操作截图保留正常焦点轮廓；另用真实鼠标清除焦点后直接截图 `collapsible-frame-default.png`，以展示默认展开样式，证明文件为 `collapsible-frame-default-proof.json`。

## 此前补充：展开区明确从属于父项

该轮 Test Vault 构建为 `zcode-backend-settings-refresh.202611091209`。用户指出展开后的高级字段与普通设置看起来同级；本次用显式 disclosure body 包住风险说明、启动参数与环境变量，并采用缩进、1px 主题细线、淡主题底色、12px/500 子项标签和紧凑间距。环境变量编辑器移入所属 Setting 的控件区，“添加变量”位于环境变量之下，不再提前显示在启动参数前。参数／环境变量的持久化逻辑未变。

实机鼠标展开高级区，并添加一条空的本地草稿行检查布局；未输入变量名、值或触发保存，随后经原生子标签导航丢弃草稿。深色、浅色、390px 栏宽均完成直接 CDP PNG 截图和实际 DOM 几何检查；验证子区确有缩进、按钮属于环境变量控件且不再全宽、无横向溢出，主题与原收起状态恢复。证据为 `disclosure-hierarchy-{dark,dark-draft,narrow,light}.png`、`disclosure-hierarchy-runtime.json`，细节裁剪另附原图哈希与裁剪坐标。

4 个 focused suite／41 项测试、typecheck、零警告 DSH source lint、模块文档、源图新鲜度及构建通过；四个部署文件 hash 一致，运行 BUILD_ID 已回读。独立 custom-subagent 实际查看四张新图，认为子项层级和按钮归属清楚、明暗与窄栏无实质视觉阻塞，可用于本轮用户预览。该结论不替代用户的审美选择。

CodeGraph 修改前：`renderConnection`、`renderLaunchAdvanced` 各有 1 个不同的直接 method 调用者，depth 1 各为同文件 2 个节点。源码变动限定于 DSH section 和 DSH scoped CSS，未新增状态 owner。

## 此前补充：恢复区放在内容之后

该轮 Test Vault 构建为 `zcode-backend-settings-refresh.202611091156`。用户指出标题上方的来源／恢复区不舒服；本次只让 DSH `renderTab` 将已有 bar 节点放到设置内容之后，保留原有恢复按钮与事件，默认收起。底部改为左对齐有界展开，DOM 顺序和键盘顺序同步。实机鼠标展开后标题 y 坐标不变，390px 内容栏无横向溢出；检查完成后恢复原视口与收起状态。证据为 `recovery-footer-{collapsed,expanded,narrow}.png` 和 `recovery-footer-runtime.json`。本次 4 个 focused suite／41 项测试、typecheck、DSH source lint、模块文档和生产构建通过，四个部署文件 hash 一致，运行 BUILD_ID 已另行回读。

CodeGraph 修改前记录：`SettingsDshSection::renderTab` 有 2 个不同的直接 method 调用者，depth 1 范围为 3 个节点，全部位于同一 DSH 模块。没有修改共享恢复存储或其他后端的挂载位置。

## 上一轮主题融合记录

用户在三个 HTML 方案中选择 A，并要求保留原有横向子标签、使用插件自定义下拉框。本轮只调整 DSH 的设置页。用户随后指出固定的炭黑背景与当前主题差异过大，明确要求保留风格倾向、避免割裂；最终实现据此使用透明画布和宿主主题颜色。此前六后端更新的审查结论保留其原有构建身份。

主题融合轮运行 OpenCodian 2.1.5，BUILD_ID `zcode-backend-settings-refresh.202611091144`，宿主为 macOS Obsidian 1.15.0。`main.js`、`manifest.json`、`styles.css`、`pdf-engine.js` 的部署 SHA-256 均与本次构建相同，重载后另行回读了运行中的 BUILD_ID。

连接页使用平整设置行和单条分隔线，原生／ACP 使用紧凑分段控件，程序路径和工作目录使用现有 `SettingsDropdownControl`。选择自定义后，输入框在原行展开；选择本身不写入空路径，非空输入 change 时保存，保存失败恢复原配置与控件。当前库范围和下次连接生效只说明一次，高风险启动参数与环境变量仍在独立展开区。横向连接、模型与行内、MCP、原生默认值四个子标签保留。

工作区最大宽度为 1030px；字段右列控件宽 300px，列间距 26px。390px 实际内容栏中，字段改为单列、间距 11px，连接测试保留紧凑的行尾按钮。DSH 不再定义独立的奶油／炭黑调色板，也不覆盖 `--text-normal`、`--background-primary` 等宿主变量。背景透明，文字、次要文字、分隔线、表单底色、选中边界、焦点和按钮均沿用主题，A 的风格由布局、留白和标题层级承载。

实际交互使用 Obsidian 官方 CLI 的 CDP 鼠标／键盘输入：打开自定义菜单、在当前文档 body 观察 listbox、选择自定义并验证输入焦点、确认空值未保存、用键盘恢复自动查找，并验证 Esc 只关闭菜单。点击真实连接测试按钮后显示“已连接”。这些行为于 1121 构建验证；到 1144 仅 DSH CSS 配色变化，连接渲染、路径保存和下拉组件源码均未改变。新主题的布局截图和页面状态另行回读。主题、视口、传输与路径配置恢复由前后实际状态比较证明。

本轮全量验证在 1121 构建得到 1041 个 suite、11439 个测试通过，2 个 suite／6 个测试跳过，类型检查、文档、图新鲜度及生产构建通过。该次 verify 的 lint 阶段曾输出一条新增测试文件过长警告；随后将路径测试独立拆分，主代理重新运行全仓 `npm run lint -- --max-warnings 0`，结果为 0 errors／0 warnings，三个 focused suite 共 37 个用例重新通过。1144 的后续改动仅为主题 CSS，重新完成构建、部署、源图刷新和样式／页面检查；不把 1121 的全量测试冒充 1144 新跑。

CodeGraph 在用户明确授权后已初始化并同步。`renderConnection` 与 `renderPathSetting` 各有 1 个不同的直接 method 调用者，depth 1 范围各为 2 个节点，均在 DSH 模块内。原测试中重复 MCP helper 无法逐定义消歧，因此未作去重；独立拆分测试没有触碰它们。最终 status 与 affected 输出保留在任务证据内。

当前证据在任务工作树 `.impeccable/review/dsh-style-a/`：

- `theme-{dark,light}-wide.png`、`theme-{dark,light}-narrow.png`：1144 的真实宿主主题配色，窄栏实际宽度 390px。
- `theme-dark-tab-{connection,model,mcp,configuration}.png`：1144 的实际四个子标签。
- `theme-aligned-runtime.json`：每张 PNG 的 SHA-256、截图前后相同的实际主题／页面／构建身份、DOM 布局与恢复结果。
- `dropdown-runtime.json`：1121 的真实鼠标／键盘行为回读；配置与组件源码未变，作为同交互实现的有限复用。
- `validation-summary.json`、`codegraph-affected.json`：验证身份和边界。

旧 `dev:screenshot` 批量截图被独立审阅发现与标签存在一帧状态错位；`connection-*-final.png`、1115 子标签图及其 `runtime-captures.json` 不能作为最终截图身份或覆盖证据。旧固定色板也已被用户否定。新版使用官方 CLI 的 `Page.captureScreenshot`，在实际主题／页面和同步布局回读后直接取回 PNG，并为每张图记录截图前后的实际身份。遮挡中的窗口没有及时完成 animation-frame Promise，该路径超时后已先确认状态恢复，未将其作为绘制就绪证据；旧文件保留为历史记录。

最终截图经同一独立 custom-subagent 复核，结论为本轮 DSH 用户预览可交付：背景在明暗主题下均与宿主连续，横向子标签、平铺行、紧凑选择保留，四个子页身份正确，可见区域无明显重叠或裁切。该结论为截图审阅，不替代用户的审美判断。最终实测文字对比度最低值为深色 9.23:1、浅色 9.33:1；390px 与宽屏无横向溢出，背景有效颜色与宿主相同，主题与配置恢复成功。详见 `visual-review.md` 和 `theme-aligned-measurements.json`。

原仓库检出保持干净，任务工作树无 tracked deletion；未提交、推送或发布。本轮结果用于用户查看实际 DSH 效果，尚不推广到其他后端。
