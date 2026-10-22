"""Minimal deterministic YAML loader for VeriCEMS config files.

Uses PyYAML (`yaml.safe_load`) when installed in `.venv`, and provides a deterministic
subset parser supporting mappings, lists of scalars/mappings, strings, integers, floats,
booleans, and `null` so repository scripts work with zero extra external dependencies.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any


def _parse_scalar(token: str) -> Any:
    val = token.strip()
    if val == "" or val in ("null", "Null", "NULL", "~"):
        return None
    if val in ("true", "True", "TRUE"):
        return True
    if val in ("false", "False", "FALSE"):
        return False
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        return ast.literal_eval(val)
    try:
        return int(val)
    except ValueError:
        pass
    try:
        return float(val)
    except ValueError:
        pass
    return val


def _strip_inline_comment(line: str) -> str:
    in_single = False
    in_double = False
    for idx, ch in enumerate(line):
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "#" and not in_single and not in_double:
            if idx == 0 or line[idx - 1].isspace():
                return line[:idx].rstrip()
    return line.rstrip()


def load_yaml_text(text: str) -> dict[str, Any]:
    """Parse YAML text into a Python dictionary."""
    try:
        import yaml  # type: ignore[import-untyped]

        loaded = yaml.safe_load(text)
        if isinstance(loaded, dict):
            return loaded
    except ImportError:
        pass

    cleaned_lines: list[tuple[int, str]] = []
    for raw_line in text.splitlines():
        stripped = _strip_inline_comment(raw_line)
        if not stripped.strip():
            continue
        indent = len(stripped) - len(stripped.lstrip(" "))
        cleaned_lines.append((indent, stripped.strip()))

    def parse_block(index: int, min_indent: int) -> tuple[Any, int]:
        if index >= len(cleaned_lines):
            return {}, index
        first_indent, first_content = cleaned_lines[index]
        if first_indent < min_indent:
            return {}, index

        if first_content.startswith("- "):
            items: list[Any] = []
            while index < len(cleaned_lines):
                indent, content = cleaned_lines[index]
                if indent < first_indent or not content.startswith("- "):
                    break
                if indent > first_indent:
                    break
                item_body = content[2:].strip()
                index += 1
                if ":" in item_body and not (item_body.startswith('"') or item_body.startswith("'")):
                    k, v_str = item_body.split(":", 1)
                    obj: dict[str, Any] = {}
                    v_str = v_str.strip()
                    if v_str:
                        obj[k.strip()] = _parse_scalar(v_str)
                    else:
                        nested, index = parse_block(index, indent + 2)
                        obj[k.strip()] = nested
                    while index < len(cleaned_lines):
                        sub_indent, sub_content = cleaned_lines[index]
                        if sub_indent <= indent or sub_content.startswith("- "):
                            break
                        if ":" in sub_content:
                            sk, sv_str = sub_content.split(":", 1)
                            sv_str = sv_str.strip()
                            index += 1
                            if sv_str:
                                obj[sk.strip()] = _parse_scalar(sv_str)
                            else:
                                nested_sub, index = parse_block(index, sub_indent + 2)
                                obj[sk.strip()] = nested_sub
                        else:
                            index += 1
                    items.append(obj)
                else:
                    items.append(_parse_scalar(item_body))
            return items, index

        mapping: dict[str, Any] = {}
        while index < len(cleaned_lines):
            indent, content = cleaned_lines[index]
            if indent < first_indent:
                break
            if indent > first_indent or content.startswith("- "):
                break
            if ":" not in content:
                index += 1
                continue
            key, val_str = content.split(":", 1)
            key = key.strip()
            val_str = val_str.strip()
            index += 1
            if val_str:
                mapping[key] = _parse_scalar(val_str)
            else:
                nested, index = parse_block(index, indent + 2)
                mapping[key] = nested
        return mapping, index

    result, _ = parse_block(0, 0)
    if not isinstance(result, dict):
        raise ValueError("Top-level YAML structure must be a mapping.")
    return result


def load_yaml_file(path: Path) -> dict[str, Any]:
    """Load a YAML configuration file from disk."""
    return load_yaml_text(path.read_text(encoding="utf-8"))
