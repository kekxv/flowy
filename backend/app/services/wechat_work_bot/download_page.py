"""Responsive HTML for signed intranet file download confirmation."""

from html import escape


def _format_file_size(size: int | None) -> str:
    if size is None or size < 0:
        return "未知"
    value = float(size)
    units = ("B", "KB", "MB", "GB", "TB")
    unit = units[0]
    for candidate in units:
        unit = candidate
        if value < 1024 or candidate == units[-1]:
            break
        value /= 1024
    if unit == "B":
        return f"{int(value)} B"
    rendered = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{rendered} {unit}"


def render_download_confirmation(
    filename: str,
    size: int | None,
    source_name: str,
    download_url: str,
) -> str:
    """Render an escaped, dependency-free confirmation page."""
    safe_filename = escape(filename)
    safe_size = escape(_format_file_size(size))
    safe_source = escape(source_name)
    safe_url = escape(download_url, quote=True)
    extension = filename.rsplit(".", 1)[-1].upper() if "." in filename else "FILE"
    safe_extension = escape(extension[:10])

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f4f7fb">
  <title>确认下载 · Flowy</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #162033;
      --muted: #68758a;
      --line: rgba(118, 137, 165, .20);
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --surface: rgba(255, 255, 255, .92);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: max(24px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
               max(24px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
      overflow-x: hidden;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "PingFang SC", "Microsoft YaHei", sans-serif;
      background:
        radial-gradient(circle at 12% 14%, rgba(59, 130, 246, .16), transparent 34%),
        radial-gradient(circle at 90% 85%, rgba(14, 165, 233, .12), transparent 30%),
        linear-gradient(145deg, #f8fafc 0%, #eef4fb 52%, #f7f9fc 100%);
    }}
    body::before, body::after {{
      content: "";
      position: fixed;
      width: 260px;
      height: 260px;
      border-radius: 999px;
      filter: blur(2px);
      pointer-events: none;
    }}
    body::before {{ top: -150px; right: -90px; background: rgba(37, 99, 235, .08); }}
    body::after {{ bottom: -170px; left: -80px; background: rgba(6, 182, 212, .08); }}
    main {{ width: min(100%, 540px); position: relative; z-index: 1; }}
    .brand {{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      margin-bottom: 18px;
      color: #53627a;
      font-size: 13px;
      font-weight: 650;
      letter-spacing: .02em;
    }}
    .brand-mark {{
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 9px;
      color: white;
      font-weight: 800;
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
      box-shadow: 0 8px 20px rgba(37, 99, 235, .24);
    }}
    .card {{
      padding: 36px;
      border: 1px solid rgba(255, 255, 255, .85);
      border-radius: 28px;
      background: var(--surface);
      box-shadow: 0 28px 80px rgba(30, 55, 90, .13), 0 3px 12px rgba(30, 55, 90, .06);
      backdrop-filter: blur(18px);
    }}
    .file-icon {{
      width: 76px;
      height: 76px;
      display: grid;
      place-items: center;
      margin: 0 auto 21px;
      border-radius: 24px;
      color: var(--primary);
      background: linear-gradient(145deg, #eff6ff, #dbeafe);
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, .08);
    }}
    h1 {{
      margin: 0;
      text-align: center;
      font-size: clamp(21px, 5vw, 27px);
      line-height: 1.28;
      letter-spacing: -.025em;
    }}
    .subtitle {{
      margin: 9px 0 25px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }}
    .filename {{
      margin: 0 0 20px;
      padding: 16px 17px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #f8fafc;
      font-size: 15px;
      font-weight: 650;
      line-height: 1.5;
      overflow-wrap: anywhere;
      text-align: center;
    }}
    .meta {{
      margin: 0 0 25px;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }}
    .meta-row {{
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      padding: 13px 2px;
      font-size: 13px;
    }}
    .meta-row + .meta-row {{ border-top: 1px solid var(--line); }}
    .meta dt {{ color: var(--muted); }}
    .meta dd {{
      margin: 0;
      min-width: 0;
      text-align: right;
      font-weight: 650;
      overflow-wrap: anywhere;
    }}
    .type {{
      display: inline-flex;
      justify-self: end;
      padding: 4px 9px;
      border-radius: 999px;
      color: #1d4ed8;
      background: #eaf2ff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .04em;
    }}
    .download {{
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      border-radius: 16px;
      color: white;
      text-decoration: none;
      font-size: 15px;
      font-weight: 720;
      background: linear-gradient(135deg, #3b82f6, #2563eb 55%, #1d4ed8);
      box-shadow: 0 13px 28px rgba(37, 99, 235, .26);
      transition: transform .16s ease, box-shadow .16s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }}
    .download:hover {{ transform: translateY(-1px); box-shadow: 0 16px 32px rgba(37, 99, 235, .31); }}
    .download:active {{ transform: translateY(1px) scale(.995); }}
    .note {{
      margin: 17px 0 0;
      text-align: center;
      color: #8a96a8;
      font-size: 12px;
      line-height: 1.55;
    }}
    @media (max-width: 560px) {{
      body {{ place-items: start center; padding-top: max(28px, env(safe-area-inset-top)); }}
      .brand {{ margin-bottom: 14px; }}
      .card {{ padding: 27px 21px 24px; border-radius: 23px; }}
      .file-icon {{ width: 68px; height: 68px; border-radius: 21px; margin-bottom: 18px; }}
      .subtitle {{ margin-bottom: 20px; }}
      .filename {{ padding: 14px; font-size: 14px; }}
      .meta-row {{ grid-template-columns: 70px minmax(0, 1fr); gap: 10px; }}
      .download {{ min-height: 58px; border-radius: 15px; }}
    }}
    @media (prefers-reduced-motion: reduce) {{ .download {{ transition: none; }} }}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="brand-mark">F</span><span>Flowy 安全下载</span></div>
    <section class="card" aria-labelledby="download-title">
      <div class="file-icon" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>
        </svg>
      </div>
      <h1 id="download-title">确认下载文件</h1>
      <p class="subtitle">请核对文件信息，确认后将开始下载</p>
      <p class="filename">{safe_filename}</p>
      <dl class="meta">
        <div class="meta-row"><dt>文件类型</dt><dd class="type">{safe_extension}</dd></div>
        <div class="meta-row"><dt>文件大小</dt><dd>{safe_size}</dd></div>
        <div class="meta-row"><dt>文件来源</dt><dd>{safe_source}</dd></div>
      </dl>
      <a class="download" href="{safe_url}">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
        确认下载
      </a>
      <p class="note">链接具有时效性，请勿转发给无关人员</p>
    </section>
  </main>
</body>
</html>"""


def render_download_link_expired() -> str:
    """Render a mobile-friendly explanation for invalid or expired download links."""
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f4f7fb">
  <title>链接已过期 · Flowy</title>
  <style>
    :root { color-scheme: light; --ink: #162033; --muted: #68758a; --surface: rgba(255,255,255,.92); }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100svh; display: grid; place-items: center;
      padding: max(24px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
               max(24px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
      color: var(--ink); font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
        "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at 12% 14%, rgba(59,130,246,.16), transparent 34%),
        radial-gradient(circle at 90% 85%, rgba(14,165,233,.12), transparent 30%),
        linear-gradient(145deg, #f8fafc 0%, #eef4fb 52%, #f7f9fc 100%);
    }
    main { width: min(100%, 500px); }
    .brand { margin: 0 0 18px; text-align: center; color: #53627a; font-size: 13px; font-weight: 650; }
    .card { padding: 36px; border: 1px solid rgba(255,255,255,.85); border-radius: 28px;
      background: var(--surface); box-shadow: 0 28px 80px rgba(30,55,90,.13), 0 3px 12px rgba(30,55,90,.06); }
    .icon { width: 76px; height: 76px; display: grid; place-items: center; margin: 0 auto 21px;
      border-radius: 24px; color: #c2410c; background: linear-gradient(145deg, #fff7ed, #ffedd5); }
    h1 { margin: 0; text-align: center; font-size: clamp(21px, 5vw, 27px); line-height: 1.28; letter-spacing: -.025em; }
    p { margin: 10px 0 0; text-align: center; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .tip { margin-top: 23px; padding: 14px 16px; border-radius: 16px; background: #f8fafc; color: #526176; font-size: 13px; }
    @media (max-width: 560px) { body { place-items: start center; padding-top: max(28px, env(safe-area-inset-top)); }
      .card { padding: 27px 21px 24px; border-radius: 23px; } .icon { width: 68px; height: 68px; border-radius: 21px; } }
  </style>
</head>
<body>
  <main>
    <div class="brand">Flowy 安全下载</div>
    <section class="card" aria-labelledby="expired-title">
      <div class="icon" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      </div>
      <h1 id="expired-title">下载链接已过期或无效</h1>
      <p>为保障文件安全，此下载链接已不能继续使用。</p>
      <p class="tip">请返回企业微信，重新执行文件查询并打开新的下载链接。</p>
    </section>
  </main>
</body>
</html>"""
