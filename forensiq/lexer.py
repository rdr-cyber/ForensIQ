"""
forensiq.lexer -- tokenizer for the ForensiQ DSL (.fzq scripts).

Design notes
------------
Jocky is a small, keyword-driven, line-oriented language. Every line is a
"statement" of the form:

    KEYWORD arg arg ... ["string literal"] [IDENT...]

Example:

    acquire file "C:/target.txt"
    hash sha256
    log "hash computed"

Because forensic scripts run on live, protected systems, the lexer is written
to be maximally transparent:

  * it never executes anything -- it only classifies characters,
  * it reports precise line/column positions for every token (so the parser
    and interpreter can produce evidence-friendly diagnostics),
  * it fails loudly and early on malformed input instead of guessing,
  * the entire tokenizer is a single pass over the source, so an auditor can
    read it in one sitting.

Token kinds
-----------
  KEYWORD : acquire, hash, log, ... (case-insensitive; normalized to lower)
  IDENT   : sha256, md5, file, mem, path names without quotes, ...
  STRING  : "anything" (double quotes; supports \\" and \\\\ escapes)
  NUMBER  : 42, 3.14
  NEWLINE : statement separator
  EOF     : end of input
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import List


class TokenKind(Enum):
    KEYWORD = auto()
    IDENT = auto()
    STRING = auto()
    NUMBER = auto()
    NEWLINE = auto()
    EOF = auto()


# Keywords are case-insensitive and normalized to lowercase by the lexer,
# so "ACQUIRE", "Acquire" and "acquire" are the same keyword.
KEYWORDS = frozenset(
    {
        "acquire",
        "hash",
        "log",
        "scan",
        "analyze",
        "report",
        "connect",
        "capture",
        "parse",
        "export",
        "set",
        "if",
        "else",
        "end",
        "for",
        "in",
        "return",
    }
)


@dataclass(frozen=True)
class Token:
    kind: TokenKind
    value: str
    line: int  # 1-based line number
    col: int  # 1-based column of the token's first character

    def __repr__(self) -> str:  # nicer debugging than the dataclass default
        return f"Token({self.kind.name}, {self.value!r}, {self.line}:{self.col})"


class LexError(Exception):
    """Raised on malformed source. Carries line/column for diagnostics."""

    def __init__(self, message: str, line: int, col: int) -> None:
        super().__init__(f"Lex error at line {line}, col {col}: {message}")
        self.line = line
        self.col = col


class Lexer:
    def __init__(self, source: str) -> None:
        self.source = source
        self.pos = 0
        self.line = 1
        self.col = 1

    # ------------------------------------------------------------------ #
    # helpers
    # ------------------------------------------------------------------ #

    def _peek(self, offset: int = 0) -> str:
        idx = self.pos + offset
        return self.source[idx] if idx < len(self.source) else ""

    def _advance(self) -> str:
        ch = self._peek()
        if not ch:
            return ""
        self.pos += 1
        if ch == "\n":
            self.line += 1
            self.col = 1
        else:
            self.col += 1
        return ch

    def _skip_inline_space(self) -> None:
        while self._peek() in (" ", "\t", "\r"):
            self._advance()

    # ------------------------------------------------------------------ #
    # token scanners
    # ------------------------------------------------------------------ #

    def _scan_string(self) -> Token:
        start_line, start_col = self.line, self.col
        self._advance()  # consume opening quote
        out: List[str] = []
        while True:
            ch = self._peek()
            if ch == "" or ch == "\n":
                raise LexError("unterminated string literal", start_line, start_col)
            self._advance()
            if ch == "\\":
                esc = self._peek()
                if esc in ('"', "\\", "n", "t"):
                    out.append({"n": "\n", "t": "\t"}.get(esc, esc))
                    self._advance()
                else:
                    raise LexError(f"invalid escape sequence '\\{esc}'", self.line, self.col)
            elif ch == '"':
                break
            else:
                out.append(ch)
        return Token(TokenKind.STRING, "".join(out), start_line, start_col)

    def _scan_word(self) -> Token:
        start_line, start_col = self.line, self.col
        chars: List[str] = []
        # Words may contain letters, digits, underscores, hyphens, dots,
        # and ':' so things like sha256, eicar.com, or 192.168.1.10:8080
        # lex as a single IDENT without needing quotes.
        while self._peek() and (self._peek().isalnum() or self._peek() in "_-.:/"):
            chars.append(self._advance())
        value = "".join(chars)
        kind = TokenKind.KEYWORD if value.lower() in KEYWORDS else TokenKind.IDENT
        return Token(kind, value.lower() if kind is TokenKind.KEYWORD else value, start_line, start_col)

    # ------------------------------------------------------------------ #
    # main loop
    # tokens() returns a flat list ending in a single EOF token.
    # ------------------------------------------------------------------ #

    def tokens(self) -> List[Token]:
        result: List[Token] = []
        while self.pos < len(self.source):
            self._skip_inline_space()
            ch = self._peek()

            if ch == "":
                break

            if ch == "\n":
                line, col = self.line, self.col
                self._advance()
                # collapse consecutive newlines into one NEWLINE token,
                # so blank lines between statements are allowed.
                if result and result[-1].kind is not TokenKind.NEWLINE:
                    result.append(Token(TokenKind.NEWLINE, "\n", line, col))
                continue

            if ch == "#":  # comment to end of line
                while self._peek() and self._peek() != "\n":
                    self._advance()
                continue

            if ch == '"':
                result.append(self._scan_string())
                continue

            if ch.isdigit():
                start_line, start_col = self.line, self.col
                chars = [self._advance()]
                while self._peek().isdigit():
                    chars.append(self._advance())
                if self._peek() == "." and self._peek(1).isdigit():
                    chars.append(self._advance())  # the '.'
                    while self._peek().isdigit():
                        chars.append(self._advance())
                result.append(Token(TokenKind.NUMBER, "".join(chars), start_line, start_col))
                continue

            if ch.isalpha() or ch == "_":
                result.append(self._scan_word())
                continue

            raise LexError(f"unexpected character {ch!r}", self.line, self.col)

        result.append(Token(TokenKind.EOF, "", self.line, self.col))
        return result


def tokenize(source: str) -> List[Token]:
    """Convenience wrapper: source text -> list of Tokens (ends with EOF)."""
    return Lexer(source).tokens()
