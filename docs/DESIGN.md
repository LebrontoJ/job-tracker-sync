# Job Tracker Sync：Chrome 插件设计文档（v2）

> 在 Gmail 中打开求职相关邮件（拒信 / 约面试 / OA / Offer），自动解析公司名与职位名，匹配 Google 表格中的对应行，并一键更新状态。

**v2 相对 v1 的变化**：邮件类型从"是否拒信"扩展为拒信 / 约面试 / OA / Offer / 其他；新增类型 → 状态映射、状态回退保护、面试时间写入；可选 Google Calendar 集成；项目更名为 Job Tracker Sync。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────┐
│ Gmail 页面 (mail.google.com)                        │
│  content script: 读取主题/正文/发件人、读取选中文本   │
└───────────────┬─────────────────────────────────────┘
                │ chrome.runtime 消息
┌───────────────▼─────────────────────────────────────┐
│ Background service worker (无状态,可随时休眠)         │
│  - OAuth token (chrome.identity)                    │
│  - Sheets API 调用 (读/写/读下拉选项)                │
│  - AI 解析 API 调用 (Gemini)                        │
│  - (可选) Calendar API 创建面试事件                  │
└───────────────▲─────────────────────────────────────┘
                │ 消息
┌───────────────┴─────────────────────────────────────┐
│ Side Panel (主 UI) + Options 页 (初始配置)           │
└─────────────────────────────────────────────────────┘
```

**为什么用 Side Panel 而不是注入弹窗**：它独立于 Gmail 的 DOM，不会被 Gmail 重渲染冲掉，而且在邮件正文里拖选文字时面板不会抢走选区，这对"拖选兜底"很关键。

## 二、项目结构

```
job-tracker-sync/
├─ manifest.json
├─ src/
│  ├─ background/
│  │  ├─ index.ts          # 消息路由
│  │  ├─ auth.ts           # getAuthToken
│  │  ├─ sheets.ts         # Sheets API 封装
│  │  ├─ calendar.ts       # (可选) Calendar API
│  │  └─ ai.ts             # Gemini 调用
│  ├─ content/
│  │  └─ gmail.ts          # 提取邮件、监听选区
│  ├─ core/                # 纯函数,可单元测试
│  │  ├─ normalize.ts
│  │  ├─ classifier.ts     # 邮件类型规则分类
│  │  ├─ ruleParser.ts     # 公司/职位规则解析
│  │  ├─ matcher.ts        # 匹配打分
│  │  ├─ statusFlow.ts     # 状态顺序与回退保护
│  │  └─ types.ts
│  ├─ sidepanel/           # 主界面
│  └─ options/             # 绑定表格、列映射、状态映射、API Key
```

`core/` 不依赖 Chrome API，建议先写它并配测试用例。

## 三、manifest.json 关键项

```json
{
  "manifest_version": 3,
  "name": "Job Tracker Sync",
  "version": "0.1.0",
  "permissions": ["identity", "storage", "sidePanel"],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://sheets.googleapis.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "oauth2": {
    "client_id": "<你的 client id>.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
  },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["content.js"]
    }
  ],
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "同步求职状态" },
  "options_page": "options.html"
}
```

- 点击工具栏图标打开面板：`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`。
- 启用 Calendar 功能（M8）时，再追加 scope `https://www.googleapis.com/auth/calendar.events` 和 host `https://www.googleapis.com/*`。

## 四、数据模型（存 chrome.storage.local）

```ts
type EmailType =
  | "rejection" // 拒信
  | "interview" // 约面试(含 recruiter call)
  | "assessment" // OA / 编程测试 / take-home
  | "offer" // Offer
  | "other"; // 确认收到申请、其他

interface Config {
  spreadsheetId: string;
  geminiApiKey: string;
  sheets: SheetMapping[]; // 每张子表一份映射
  statusMapping: Record<EmailType, string | null>;
  // 例: { rejection: "Rejected", interview: "Interview",
  //       assessment: "OA", offer: "Offer", other: null }
  statusOrder: string[]; // 状态先后顺序,用于回退保护
  // 例: ["Applied", "OA", "Interview", "Offer"]
}

interface SheetMapping {
  sheetTitle: string; // 子表名
  enabled: boolean; // 是否参与搜索
  headerRow: number; // 表头所在行,默认 1
  companyCol: string; // 列字母,如 "B"
  roleCol: string; // "C"
  statusCol: string; // "H"
  noteCol?: string; // 可选:写入面试时间等备注
  fillColor?: string; // 可选:标记后整行底色
}

interface ParsedEmail {
  company: string;
  role: string; // 可能为空(面试邮件常缺职位)
  type: EmailType;
  interviewTime?: string; // 可选,如 "2026-10-08 14:00 ET"
  source: "rule" | "ai" | "manual";
}

interface MatchCandidate {
  sheetTitle: string;
  rowIndex: number; // 1-based 实际行号
  rowValues: string[]; // 整行内容,用于确认展示
  company: string;
  role: string;
  currentStatus: string;
  score: number; // 0~1
}
```

**设置页流程**：粘贴表格链接 → 提取 ID → `spreadsheets.get` 列出子表 → 对每张子表读表头行，按关键词自动猜列（company / 公司 / employer、position / role / title / 职位、status / 状态 / stage、note / 备注）→ 用户确认或修改 → 配置类型到状态的映射与状态顺序 → 保存。这样多张表结构不同也能处理。

## 五、核心流程与状态机

```
IDLE → PARSING → PARSED(可编辑类型/公司/职位)
  → [点"查找"] SEARCHING
      → FOUND_ONE / FOUND_MULTI / NOT_FOUND
  → FOUND_*: 选中候选 → [点"更新"] LOADING_OPTIONS → CHOOSING_STATUS
      → (状态回退检查) → WRITING → DONE
  → NOT_FOUND: 提示"在邮件中拖选正确文本填入对应框后再次查找"
```

**触发时机**：点开面板，或 Gmail 切换到另一封邮件（content script 监听 `hashchange` + MutationObserver）时自动重新解析。

### 面板 UI 草图

```
┌ 求职邮件标记 ──────────────┐
│ 类型    [ 约面试 ▾ ]         │  ← 自动识别,可改
│ 公司名  [ Stripe       ]   │  ← 点击聚焦后,在邮件里拖选文本会自动填入
│ 职位名  [ Software Eng ]   │
│ 面试时间 2026-10-08 14:00   │  ← 仅 interview 类型显示,可编辑
│ 解析来源: AI                │
│        [ 查 找 ]            │
├────────────────────────────┤
│ ✅ 找到 1 条 (Sheet: 2026)  │
│ 第 23 行 | Stripe | SWE    │
│ 当前状态: Applied           │
│        [ 更 新 ]            │
├────────────────────────────┤
│ 新状态: (Interview ▾)       │
│ ☑ 同时写入面试时间到 [备注列]  │
│               [ 确认 ]      │
└────────────────────────────┘
```

## 六、邮件解析（规则优先，AI 兜底）

### content script 提取

选择器需容错，失败时退化到 `document.title`：

- 主题：`h2.hP`
- 发件人：`span.gD` 的 `email` 属性
- 正文：`div.a3s.aiL`，取 `innerText` 前 1500 字

### 类型分类 `classifier.ts`（规则粗分类）

| 类型       | 典型关键词                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| rejection  | "unfortunately", "not moving forward", "decided to pursue other candidates"                      |
| interview  | "schedule an interview", "invite you to interview", "next steps", "availability", "phone screen" |
| assessment | "online assessment", "HackerRank", "CodeSignal", "take-home"                                     |
| offer      | "pleased to offer", "offer letter"                                                               |

多个类型关键词同时命中时，以优先级 offer > rejection > interview > assessment 判定，冲突或低置信度时交给 AI。

### 公司/职位规则解析 `ruleParser.ts`

按发件域名 / 主题模板匹配，示例正则：

```
/your application (?:to|for|at) (.+)$/i
/update on your (.+?) application/i
/thank you for applying to (.+?)[.!]/i
/position of (.+?) at (.+?)[.,]/i
```

Workday / Greenhouse / Lever / Ashby 的发件域名（`myworkday.com`、`greenhouse.io`、`hire.lever.co`）可以给每种模板单独一组规则。规则同时提取到公司和职位则 `source="rule"`，直接展示，不调 AI。

### 约面试邮件的额外难点

- 很多面试邮件来自 Calendly、GoodTime、Greenhouse Scheduling 等工具，发件人域名不是公司，主题也很泛（如 "Schedule your interview"）。
- 职位名经常缺失，只有公司名，因此匹配时必须支持**仅凭公司名匹配**（见第七节）。
- 这类邮件中规则只负责分类，公司名和职位更多依赖 AI，AI 兜底的触发频率会比拒信高。

### AI 兜底 `ai.ts`

规则任一字段缺失才调用。Gemini 开启 JSON schema 输出：

```
System: 你从求职邮件中抽取信息。只输出 JSON。
公司名给官方简称(不带 Inc./LLC),职位名保持邮件原文。
面试时间输出 ISO 8601 并带时区。无法确定则填空字符串。
Schema: { "company": string, "role": string,
          "type": "rejection|interview|assessment|offer|other",
          "interviewTime": string }
User: 主题: {subject}\n发件人: {from}\n正文: {body前1500字}
```

当类型为 `other` 时，面板提示"这封邮件看起来不是拒信/面试/OA/Offer"，但不阻止用户手动操作。

## 七、匹配算法 `matcher.ts`

### 1. 归一化

小写 → 去标点 → 去公司后缀（inc, llc, ltd, corp, co, technologies, labs…）→ 去多余空格。

职位名额外做同义词展开：`swe / software engineer / software developer → software engineer`，`sr → senior`，`jr → junior`，罗马数字 / 级别词单独保留为 level 标签。

### 2. 打分

```
companyScore = max(
  精确相等 → 1.0,
  一方包含另一方(token 子集)→ 0.9,
  Jaro-Winkler(a, b)
)
roleScore = 0.6 * tokenJaccard + 0.4 * JaroWinkler

有职位:  total = companyScore * 0.65 + roleScore * 0.35
职位为空: total = companyScore        # roleScore 不参与
```

公司权重更高，因为表里同一公司通常只有少数几行。

### 3. 决策（硬门槛：companyScore ≥ 0.8 才进候选）

| 情况                        | 行为                                   |
| --------------------------- | -------------------------------------- |
| 只有 1 个候选且 total ≥ 0.8 | 直接展示为"找到"                       |
| 多个候选                    | 按分数降序列出，让用户选               |
| 公司匹配但职位分低          | 仍列出，标注"职位不太一致"             |
| 职位为空且同公司有多行      | 全部列出，优先展示当前状态为进行中的行 |
| 无候选                      | NOT_FOUND，提示拖选                    |

### 4. 搜索实现

对每张 `enabled` 子表，用 `values:batchGet` 一次读取公司列、职位列、状态列（范围如 `'2026'!B2:B1000`），按行对齐后打分。同一次会话缓存 60 秒，避免反复调用。

## 八、状态映射与回退保护

### 类型 → 状态映射

面板点"更新"后，读取状态列下拉选项，用 `statusMapping[type]` **预选**对应项：

1. 映射值在下拉里精确存在 → 直接预选。
2. 找不到 → 用关键词模糊匹配（interview / 面试 / 约面；reject / declined / 拒；offer；OA / assessment / 笔试）。
3. 仍找不到 → 不预选，由用户手选。

用户在面板里始终可以改类型和最终状态，映射只是省一次点击。

### 状态回退保护 `statusFlow.ts`

约面试会涉及多轮，同一行状态会连续变化，需要防止"越改越退"。默认顺序：

```
Applied < OA < Interview < Offer      (Rejected 可以从任何状态转入)
```

新状态比当前状态"更早"时，面板弹轻提示："当前已是 Interview，确认改回 OA？"。这只是提示，不强制阻止；顺序在设置里可配置（`statusOrder`），因为每个人的状态命名不同。

## 九、Sheets API 细节

### 读状态列下拉选项

读候选行状态单元格的 `dataValidation`：

```
GET /v4/spreadsheets/{id}?ranges='Sheet1'!H23
    &fields=sheets.data.rowData.values.dataValidation
```

- `condition.type == "ONE_OF_LIST"` → 直接取 `values[].userEnteredValue`
- `condition.type == "ONE_OF_RANGE"` → 下拉引用了另一个区域，再读那个区域
- 都没有 → 退化为该状态列已出现的去重值，并允许手动输入

### 写入

```
PUT /v4/spreadsheets/{id}/values/'Sheet1'!H23?valueInputOption=USER_ENTERED
{ "values": [["Interview"]] }
```

- 勾选"写入面试时间"且配置了 `noteCol` 时，用 `values:batchUpdate` 同时写状态列和备注列。
- 若配置了 `fillColor`，再用 `batchUpdate` + `repeatCell` 给整行上色。

### 写前二次校验

写入前重新读取该行的公司 / 职位单元格，和之前匹配到的值比对。如果不一致（比如期间在表里排序或插入了行），中止并提示重新查找，避免写错行。

## 十、可选：创建 Google Calendar 事件

约面试之后最自然的下一步是把面试加入日历：

- 追加 scope `calendar.events`，调用 `events.insert`，标题用 "面试 - 公司名 - 职位"。
- 难点在**时区和时间解析**：邮件时间格式五花八门（"Tuesday Oct 8 at 2pm PT"），需要 AI 输出带时区的 ISO 时间，并且**必须经用户确认后再创建**。
- 多一个敏感 scope 且时间解析易错，建议放到最后，先把状态更新做稳。

## 十一、错误处理与边界

- **Token 过期**：`chrome.identity.getAuthToken` 会自动刷新；遇到 401 时 `removeCachedAuthToken` 后重试一次。
- **Gemini 限流（429）**：提示"AI 暂不可用，请手动填写或拖选"，不阻塞主流程。
- **Gmail 选择器失效**：面板显示"未能读取邮件，请手动拖选"，手动模式始终可用。
- **同一封邮件重复标记**：候选行当前状态已等于目标状态时，面板显示"已是该状态"。
- **隐私**：只发送主题 + 正文前 1500 字；API Key 只存本地。

## 十二、开发里程碑

| 阶段       | 内容                                 | 验收标准                                |
| ---------- | ------------------------------------ | --------------------------------------- |
| M1         | OAuth + 设置页 + 读表格 + 列映射     | 能列出子表并读到数据                    |
| M2         | `matcher.ts` + 面板手输公司/职位查找 | 用 20 条真实表格数据测试命中率          |
| M3         | 读下拉选项 + 写回 + 写前校验         | 能正确改状态                            |
| M4         | Gmail content script + 规则解析      | 常见 ATS 邮件自动填充                   |
| M4+        | 规则分类支持四种类型                 | 拒信 / 约面试 / OA / Offer 能被正确分类 |
| M5         | Gemini 兜底 + 拖选填充               | 非模板邮件也能处理                      |
| M5+        | AI Schema 加 type 和 interviewTime   | 非模板面试邮件能识别                    |
| M6         | 行上色、错误提示、打磨               | 日常可用                                |
| M6+        | 状态映射设置 + 回退保护              | 面试邮件一键预选正确状态                |
| M7（可选） | 面试时间写入备注列                   | 时间正确写入                            |
| M8（可选） | Google Calendar 创建事件             | 时间和时区正确                          |

M1–M3 不涉及 Gmail 和 AI，先跑通能最快验证核心价值。

## 十三、GitHub 仓库信息

**仓库名**：`job-tracker-sync`

**Description（About 栏，一行）**：

```
Chrome extension that reads job emails in Gmail (rejections, interviews, OAs, offers) and updates the matching row's status in your Google Sheets application tracker.
```

**Topics**：`chrome-extension` `manifest-v3` `gmail` `google-sheets` `job-search` `job-tracker` `typescript` `gemini-api`

**README 开头简介（完整版）**：

```markdown
# Job Tracker Sync

A Manifest V3 Chrome extension that keeps your Google Sheets job-application
tracker in sync with your Gmail inbox.

Open a job-related email in Gmail and the side panel automatically extracts the
company, role, and email type (rejection, interview, online assessment, or
offer). One click finds the matching row across your sheets, lets you pick the
new status from the column's own dropdown options, and writes it back.

## Features

- Rule-based parsing for common ATS emails (Workday, Greenhouse, Lever, Ashby),
  with a free-tier Gemini API fallback for everything else
- Fuzzy matching on company and role across multiple sheets, with candidate
  selection when several rows match
- Drag-to-select fallback: highlight text in the email to correct the company or
  role, then search again
- Status suggestions mapped from email type, reading the status column's data
  validation options, with regression protection
- Write-time verification so the wrong row is never overwritten
- Optional: save interview time to a notes column and create a Calendar event

## Privacy

Only the subject line and the first ~1500 characters of the email body are sent
to the AI API, and only when rule-based parsing is insufficient. Your API key
and sheet configuration stay in local extension storage.
```
