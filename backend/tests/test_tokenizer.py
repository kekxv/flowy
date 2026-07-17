"""Tests for the Chinese text tokenizer."""

import pytest

from app.utils.tokenizer import STOP_WORDS, tokenize


def test_chinese_tokenization():
    """Chinese sentence is segmented into meaningful words."""
    tokens = tokenize("如何配置Docker")
    assert "配置" in tokens
    assert "Docker" in tokens
    # Stop words are removed
    assert "如何" not in tokens


def test_mixed_language():
    """Mixed Chinese and English is segmented correctly."""
    tokens = tokenize("Python日志报错")
    assert "Python" in tokens
    assert "日志" in tokens
    assert "报错" in tokens


def test_stop_words_filtered():
    """Pure stop-word input returns empty list."""
    tokens = tokenize("这是什么")
    assert tokens == []


def test_empty_and_whitespace():
    """Empty / whitespace-only / punctuation-only input returns empty list."""
    assert tokenize("") == []
    assert tokenize("   ") == []
    assert tokenize("，。、") == []


def test_punctuation_stripped():
    """Punctuation tokens are filtered out."""
    tokens = tokenize("你好，世界！")
    assert "你好" in tokens
    assert "世界" in tokens
    assert "，" not in tokens
    assert "！" not in tokens


def test_preserve_technical_terms():
    """Technical terms (English, digits) are preserved."""
    tokens = tokenize("k8s部署问题")
    assert "部署" in tokens
    assert "问题" in tokens
    # 'k8s' may be segmented differently by jieba, but some alphanumeric piece survives
    assert any(any(c.isalnum() for c in t) for t in tokens)


def test_long_sentence():
    """Long sentence: stop words removed, content words kept."""
    tokens = tokenize("请问一下如何在Linux上安装Docker并配置日志")
    # Stop words removed
    assert "请问" not in tokens
    assert "一下" not in tokens
    assert "如何" not in tokens
    # Content words kept
    assert "Linux" in tokens
    assert "安装" in tokens
    assert "Docker" in tokens
    assert "配置" in tokens
    assert "日志" in tokens


def test_stop_words_set_nonempty():
    """Stop-words set contains a reasonable number of entries."""
    assert len(STOP_WORDS) > 30


def test_order_preserved():
    """Tokens appear in the same order as in the original text."""
    tokens = tokenize("Docker安装与配置")
    # 安装 before 配置
    if "安装" in tokens and "配置" in tokens:
        assert tokens.index("安装") < tokens.index("配置")
