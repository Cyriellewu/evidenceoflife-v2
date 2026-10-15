#!/usr/bin/env python3
"""Summarise synthetic persona responses (JSONL) as Markdown.

Usage: python3 -I aggregate.py responses.jsonl [--top N]

Each line is one JSON object; see ../SKILL.md for the schema. Standard
library only. Output is for internal hypothesis review, not user evidence.
"""
import argparse
import json
import sys
from collections import Counter, defaultdict

SCORES = ("comprehension", "trust", "would_try")


def valid_score(value):
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 5


def load(path):
    rows, skipped = [], []
    with open(path, encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                skipped.append(f"line {lineno}: invalid JSON ({exc.msg})")
                continue
            if not isinstance(row, dict) or not isinstance(row.get("bucket"), str):
                skipped.append(f"line {lineno}: missing bucket")
                continue
            bad = [k for k in SCORES if not valid_score(row.get(k))]
            if bad:
                skipped.append(f"line {lineno}: bad score field(s) {', '.join(bad)}")
                continue
            phrases = row.get("confusing_phrases") or []
            if not isinstance(phrases, list):
                phrases = []
            row["confusing_phrases"] = [p.strip() for p in phrases if isinstance(p, str) and p.strip()]
            rows.append(row)
    return rows, skipped


def mean(values):
    return sum(values) / len(values) if values else 0.0


def cell(text):
    return str(text).replace("|", "\\|").replace("\n", " ")


def render(rows, skipped, top):
    out = ["> SYNTHETIC personas: hypotheses only, not user evidence.", ""]
    out.append(f"Responses used: {len(rows)}; skipped: {len(skipped)}")
    out.append("")
    by_bucket = defaultdict(list)
    for row in rows:
        by_bucket[row["bucket"]].append(row)

    out.append("| Bucket | n | Comprehension | Trust | Would try |")
    out.append("| --- | ---: | ---: | ---: | ---: |")
    for bucket in sorted(by_bucket):
        group = by_bucket[bucket]
        means = [f"{mean([r[k] for r in group]):.2f}" for k in SCORES]
        out.append(f"| {cell(bucket)} | {len(group)} | " + " | ".join(means) + " |")
    if rows:
        means = [f"{mean([r[k] for r in rows]):.2f}" for k in SCORES]
        out.append(f"| **all** | {len(rows)} | " + " | ".join(means) + " |")
    out.append("")

    counts, buckets_for = Counter(), defaultdict(set)
    for row in rows:
        for phrase in set(row["confusing_phrases"]):  # count once per persona
            counts[phrase] += 1
            buckets_for[phrase].add(row["bucket"])
    out.append(f"## Most frequent confusing phrases (top {top})")
    out.append("")
    if counts:
        out.append("| Phrase | Personas | Buckets |")
        out.append("| --- | ---: | --- |")
        for phrase, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top]:
            out.append(f"| {cell(phrase)} | {n} | {cell(', '.join(sorted(buckets_for[phrase])))} |")
    else:
        out.append("_None reported._")

    if skipped:
        out += ["", "## Skipped lines", ""] + [f"- {s}" for s in skipped]
    return "\n".join(out) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", help="JSONL file of persona responses")
    parser.add_argument("--top", type=int, default=10, help="phrases to list (default 10)")
    args = parser.parse_args(argv)
    try:
        rows, skipped = load(args.path)
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    sys.stdout.write(render(rows, skipped, max(args.top, 1)))
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
