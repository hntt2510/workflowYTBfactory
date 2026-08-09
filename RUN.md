# Chạy dự án nhanh

Windows 10/11, Node.js 22+ và Python 3.11.

## Cài đặt

```powershell
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
```

## Chạy app Electron

```powershell
corepack pnpm dev
```

Web-only:

```powershell
corepack pnpm dev:web
```

App dùng SQLite tại `workspace/long-short-factory.sqlite`. Có thể đặt `WORKSPACE_ROOT` trong `.env` để đổi thư mục dữ liệu.

## Cấu hình tùy chọn

```powershell
Copy-Item .env.example .env
```

Điền thông tin 9Router nếu cần AI. Khi phát triển local không dùng OS keychain:

```powershell
$env:LSF_DEV_MEMORY_KEYCHAIN="1"
corepack pnpm dev
```

## Kiểm tra code

```powershell
corepack pnpm test:unit
corepack pnpm typecheck
corepack pnpm lint
```

FFmpeg, FFprobe, CapCut và provider credentials chỉ cần cho các flow legacy/tính năng tương ứng; luồng pre-production mặc định không yêu cầu chúng.
