import secrets
import string

CODE_ALPHABET = string.ascii_letters + string.digits
CODE_PATTERN = r"^[a-zA-Z0-9]{6,8}$"

# Codes that would be shadowed by a fixed route such as GET /health.
RESERVED_CODES = frozenset({"health"})


def generate_code(length: int) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        if code not in RESERVED_CODES:
            return code
