import re

from app.codes import generate_code


def test_generate_code_uses_base62_and_requested_length():
    for length in (6, 7, 8):
        assert re.fullmatch(rf"[a-zA-Z0-9]{{{length}}}", generate_code(length))


def test_generate_code_skips_reserved_codes(monkeypatch):
    picks = iter("health" + "abcdef")
    monkeypatch.setattr("app.codes.secrets.choice", lambda alphabet: next(picks))

    assert generate_code(6) == "abcdef"
