# Heavyhaul Railway Disease Database

重载铁路桥轨病害数据库与本地录入网页。基于 PostgreSQL/PostGIS、Node.js 和 Express，支持结构化病害记录、观测指标、空间位置及案例导入暂存。

**状态：早期研究工具。** 本次公开版本源自作者提供的 2026-08-19 代码快照，包含迁移 001—006；不代表后续本地数据库或研究成果的全部状态。原始 package.json 版本号不代表生产验收。

English: An early-stage local research tool for heavy-haul railway bridge and track defect records, with a reproducible schema, data-entry UI, spatial storage and a case-specific staging workflow. It is not a validated maintenance decision system.

## 已实现

- 线路、区段、曲线、桥梁、检测事件、病害实例与观测值录入。
- 数据库连接、字典统计、病害台账。
- PostGIS 几何录入与空间图层接口，项目 SRID 可配置。
- 17 类项目定义病害、27 条指标及 27 条病害—指标关联。
- 规范来源与阈值规则、评价结果、维修工单的数据表框架。
- 针对 B-13 调查表格式的提取、附件锚点候选、暂存导入及质量复核工具。
- 迁移登记、校验值检查和数据库 smoke test。

## 当前边界

公开仓库不包含现场调查资料、照片、实际病害记录或作者本机数据库审计输出。CSV 模板只有表头；测试中的短文本是测试用例，不是现场结果。

规范阈值、准确投影 SRID、正式坐标和自动养护决策尚待核验或实现。评价、阈值、工单表的存在不等于对应业务已经自动运行。不要根据这个版本直接作出维修、限速或运营决定。

B-13 工具是**特定案例格式的导入器**，含特定行数、照片数及历史质量对照断言；不是任意调查表的通用导入器。原始调查表未发布，相关集成测试需要自行提供有权使用的资料。

## 安装与启动

需要 Node.js 22 或更新版本、PostgreSQL 18、PostGIS 3.6（包含 topology 扩展）。源码检查和 B-13 提取另外需要 Python 3.10 或更新版本。

1. 下载源码并进入目录，运行 `npm ci`。
2. 在 PostgreSQL 中创建一个**空的专用数据库**。初始化账号须有安装 PostGIS 扩展和建表的权限。不要把已有业务数据库作为目标。
3. 复制 `.env.example` 为 `.env`，填写本机连接及密码。Windows：`Copy-Item .env.example .env`；Linux/macOS：`cp .env.example .env`。
4. 运行 `npm run db:init`。脚本拒绝已有项目 schema，按顺序执行 001—006 并登记校验值。失败时不会自动删除数据库，请检查原因后在新的空库重试。
5. 运行 `npm run db:check` 和 `npm run db:smoke`。
6. 运行 `npm start`，打开 `http://localhost:3100`。

网页绑定 `127.0.0.1`，没有用户登录与权限管理，应作为本地工具运行。不要直接通过反向代理公开录入接口。

### 可选 Docker 数据库

Docker Compose 只启动本地数据库，Node 网页在宿主机运行。准备 `.env` 后执行：

```sh
docker compose up -d --wait
npm run db:init
npm run db:smoke
npm start
```

配置使用上游 `postgis/postgis:18-3.6`，数据库端口只绑定本机，卷保留数据。修改 `.env` 不会改变已有数据库密码。

## 验证

```sh
npm test
npm run db:smoke
npm run db:check
node tests/migration_checksum_test.js
```

`npm test` 检查 JavaScript/Python 语法、原始迁移完整性和质量识别函数的典型输入，不连接数据库。其余检查需要已初始化的专用数据库；校验值测试修改临时迁移副本并确认登记表未被改写。

GitHub Actions 使用全新的 PostgreSQL/PostGIS 服务验证初始化、字典覆盖及校验值保护。是否通过以实际 Actions 结果为准。首次整理的本地验证范围见 [VALIDATION.md](VALIDATION.md)。

原生隔离集群复建：`node scripts/rebuild_verify_001_to_006.js`。将 PostgreSQL 18 可执行文件加入 PATH，或设置 `PG_BIN` 为其 bin 目录。该工具需要运行用户能启动 PostgreSQL，不适用于 root 环境。

## 目录

| 目录 | 内容 |
|---|---|
| `db/migrations` | 原始迁移 001—006，保留文件字节和校验值 |
| `db/seeds` | 项目定义病害和指标字典导出 |
| `db/tests`、`db/quality` | 数据库检查 SQL |
| `public`、`server.js` | 本地网页与 API |
| `scripts` | 初始化、迁移检查、B-13 提取和暂存工具 |
| `templates` | CSV 表头模板 |
| `tests` | 通用源码检查及条件性集成测试 |

## 开源、数据与贡献

项目代码按 [MIT License](LICENSE) 发布，依赖保留各自许可证。代码许可证不授权传播调查资料、标准全文或其他第三方数据。`standard.source_document` 只保存来源登记元数据，项目字典需与可核验规范核对。

欢迎提交可复现的问题和改进；请勿上传密码、个人资料或未获授权的铁路调查数据。见 [CONTRIBUTING.md](CONTRIBUTING.md)。
