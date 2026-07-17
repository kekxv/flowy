"""Chinese text tokenizer using jieba with stop-word filtering.

jieba's dictionary is bundled with the pip package — fully offline, no network required.
A custom user dictionary can be placed at ``app/data/userdict.txt`` to teach the
segmenter project-specific terms (product names, abbreviations, etc.).
"""

import os

import jieba

# ─── Stop words ──────────────────────────────────────────────
# Common Chinese function words, question words, pronouns, particles, etc.
# These are filtered out so the search only matches on meaningful tokens.
STOP_WORDS: set[str] = {
    # 助词 / 虚词
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "也", "很",
    "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
    "自己", "这", "他", "她", "它", "们", "那", "被", "把", "让",
    "吗", "呢", "吧", "啊", "呀", "哦", "嗯", "嘛", "哇",
    "么", "之", "其", "与", "而", "等", "已", "已经",
    # 代词
    "我们", "他们", "她们", "咱们",
    "这个", "那个", "这些", "那些", "这里", "那里", "哪里", "这是", "那是", "这些都是", "那些都是",
    # 疑问词
    "如何", "怎么", "怎样", "什么", "为什么", "哪", "谁", "多少", "几",
    # 常见口语虚词
    "可以", "能", "一个", "一下", "关于", "对于", "以及", "或者", "但是",
    "想", "知道", "请问", "帮", "帮我", "查", "帮我查",
    # 连词 / 介词
    "因为", "所以", "如果", "虽然", "然后", "而且", "不过", "还是",
}

# ─── Custom user dictionary ─────────────────────────────────
_USERDICT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "userdict.txt")
if os.path.exists(_USERDICT_PATH):
    jieba.load_userdict(_USERDICT_PATH)

# Pre-warm the segmenter so the first request isn't slow (~1s).
jieba.initialize()


def tokenize(text: str) -> list[str]:
    """Segment *text* with jieba and return meaningful tokens.

    - Strips whitespace and pure-punctuation tokens
    - Filters stop words
    - Returns tokens in their original order
    """
    if not text or not text.strip():
        return []

    words = jieba.cut(text)
    result: list[str] = []
    for w in words:
        t = w.strip()
        if not t:
            continue
        # Skip pure punctuation / whitespace tokens: keep if any char is
        # alphanumeric (incl. Chinese characters).
        if not any(c.isalnum() or "一" <= c <= "鿿" for c in t):
            continue
        if t in STOP_WORDS:
            continue
        result.append(t)
    return result
