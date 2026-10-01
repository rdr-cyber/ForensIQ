"""
forensiq.parser -- builds a small AST from the token stream.

Grammar (one statement per line, blank lines and # comments ignored):

    program     := statement*
    statement   := acquire_stmt | hash_stmt | log_stmt | ...
    acquire_stmt:= "acquire" target (STRING | IDENT)
    hash_stmt   := "hash" IDENT
    log_stmt    := "log" STRING
    report_stmt := "report" STRING
    ...

Statements are intentionally flat: no expressions, no variables, no control
flow in v0. Flat structure = trivially auditable control flow, which is the
whole point of the language.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Union

from .lexer import LexError, Token, TokenKind, tokenize


class ParseError(Exception):
    """Raised when the token stream doesn't match the grammar."""

    def __init__(self, message: str, line: int, col: int) -> None:
        super().__init__(f"Parse error at line {line}, col {col}: {message}")
        self.line = line
        self.col = col


# ---------------------------------------------------------------------- #
# AST node definitions
# ---------------------------------------------------------------------- #

@dataclass(frozen=True)
class AcquireStmt:
    target: str
    path: str
    line: int


@dataclass(frozen=True)
class HashStmt:
    algorithm: str
    line: int


@dataclass(frozen=True)
class LogStmt:
    message: str
    line: int


@dataclass(frozen=True)
class ReportStmt:
    output_path: str
    line: int


Statement = Union[AcquireStmt, HashStmt, LogStmt, ReportStmt]
Program = List[Statement]


# ---------------------------------------------------------------------- #
# Parser
# ---------------------------------------------------------------------- #

class Parser:
    def __init__(self, tokens: List[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    # -- cursor helpers ------------------------------------------------- #

    def _peek(self) -> Token:
        return self.tokens[self.pos]

    def _next(self) -> Token:
        tok = self.tokens[self.pos]
        if tok.kind is not TokenKind.EOF:
            self.pos += 1
        return tok

    def _expect(self, kind: TokenKind, what: str) -> Token:
        tok = self._peek()
        if tok.kind is not kind:
            raise ParseError(f"expected {what}, got {tok.value!r}", tok.line, tok.col)
        return self._next()

    def _skip_newlines(self) -> None:
        while self._peek().kind is TokenKind.NEWLINE:
            self._next()

    # -- grammar rules -------------------------------------------------- #

    def parse_program(self) -> Program:
        stmts: Program = []
        self._skip_newlines()
        while self._peek().kind is not TokenKind.EOF:
            stmts.append(self._parse_statement())
            self._skip_newlines()
        return stmts

    def _parse_statement(self) -> Statement:
        tok = self._peek()
        if tok.kind is not TokenKind.KEYWORD:
            raise ParseError(
                f"expected a statement keyword, got {tok.value!r}", tok.line, tok.col
            )
        if tok.value == "acquire":
            return self._parse_acquire()
        if tok.value == "hash":
            return self._parse_hash()
        if tok.value == "log":
            return self._parse_log()
        if tok.value == "report":
            return self._parse_report()
        raise ParseError(f"unknown statement {tok.value!r}", tok.line, tok.col)

    def _parse_acquire(self) -> AcquireStmt:
        kw = self._next()  # 'acquire'
        target_tok = self._expect(TokenKind.IDENT, "a target type (e.g. file, mem)")
        value_tok = self._expect(TokenKind.STRING, "a quoted path string")
        return AcquireStmt(target=target_tok.value, path=value_tok.value, line=kw.line)

    def _parse_hash(self) -> HashStmt:
        kw = self._next()  # 'hash'
        algo_tok = self._expect(TokenKind.IDENT, "an algorithm name (e.g. sha256)")
        return HashStmt(algorithm=algo_tok.value, line=kw.line)

    def _parse_log(self) -> LogStmt:
        kw = self._next()  # 'log'
        msg_tok = self._expect(TokenKind.STRING, "a quoted message")
        return LogStmt(message=msg_tok.value, line=kw.line)

    def _parse_report(self) -> ReportStmt:
        kw = self._next()  # 'report'
        out_tok = self._expect(TokenKind.STRING, "a quoted output path (e.g. \"out.json\")")
        return ReportStmt(output_path=out_tok.value, line=kw.line)


def parse(source: str) -> Program:
    """Convenience wrapper: source text -> AST (list of statements)."""
    try:
        tokens = tokenize(source)
    except LexError:
        raise
    return Parser(tokens).parse_program()
