from __future__ import annotations

import argparse
from pathlib import Path


BEGIN_MARKER = "<!-- BEGIN AI_JOBS_APPENDIX -->"
END_MARKER = "<!-- END AI_JOBS_APPENDIX -->"
DEFAULT_SOURCE_PATH = Path("/home/seanb/Downloads/Pics/AI_Jobs_Masterdoc.md")
DEFAULT_TARGET_PATH = Path(__file__).resolve().parents[1] / "data" / "ai_master.md"
INSERT_BEFORE = "| KEY PEOPLE The Humans Behind the Revolution |"

TABLE_SECTION_HEADINGS = {
    "AI Evaluation & Training Platforms (Where You Actually Work)": "AI Evaluation & Training Platforms",
    "New Job Roles AI Has Created": "New Job Roles AI Has Created",
    "Job Roles Being Eliminated or Severely Reduced": "Job Roles Being Eliminated or Severely Reduced",
    "Companies That Have Cut Jobs and Cited AI": "Companies That Have Cut Jobs and Cited AI",
}

NARRATIVE_SECTION_HEADINGS = [
    "Entry-Level and New Graduate Impact",
    "The Real Picture",
]


def _read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def _find_heading_index(lines: list[str], heading_text: str) -> int:
    """Finds a heading index, ignoring asterisks and case."""
    normalized_target = heading_text.lower().replace("*", "").strip()
    for index, line in enumerate(lines):
        if not line.strip().startswith("##"):
            continue
        normalized_line = line.strip().lstrip("#").lower().replace("*", "").strip()
        if normalized_line == normalized_target:
            return index
    raise ValueError(f"Could not find heading: {heading_text}")


def _section_body(lines: list[str], heading_text: str) -> list[str]:
    start_index = _find_heading_index(lines, heading_text) + 1
    end_index = len(lines)
    for index in range(start_index, len(lines)):
        line = lines[index].strip()
        if line.startswith("##") and index > start_index:
            end_index = index
            break
    return lines[start_index:end_index]


def _extract_first_table(section_lines: list[str]) -> list[str]:
    table_start = None
    for index, line in enumerate(section_lines):
        if line.strip().startswith("|"):
            table_start = index
            break
    if table_start is None:
        return []

    table_lines: list[str] = []
    for line in section_lines[table_start:]:
        stripped = line.strip()
        if not stripped:
            # Allow one empty line if the next line is still a table row
            continue
        if not stripped.startswith("|"):
            if table_lines:
                break
            continue
        table_lines.append(line.rstrip())
    return table_lines


def _extract_narrative_text(section_lines: list[str]) -> str:
    parts = [line.strip() for line in section_lines if line.strip() and not line.strip().startswith("|")]
    return " ".join(parts)


def build_jobs_appendix(source_path: Path) -> str:
    lines = _read_lines(source_path)
    updated_line = next((line.strip() for line in lines if line.strip().lower().startswith("updated:")), "Updated: April 2026")

    appendix_lines = [
        BEGIN_MARKER,
        f"Imported from {source_path.name} ({updated_line}).",
        "",
        "## **AI Jobs Appendix 2026**",
        "",
    ]

    for source_heading, rendered_heading in TABLE_SECTION_HEADINGS.items():
        try:
            section_lines = _section_body(lines, source_heading)
            table_lines = _extract_first_table(section_lines)
            if not table_lines:
                print(f"Warning: No table found in section '{source_heading}'")
            else:
                print(f"Imported table with {len(table_lines)} lines from '{source_heading}'")
            appendix_lines.extend(
                [
                    f"### **{rendered_heading}**",
                    *table_lines,
                    "",
                ]
            )
        except ValueError as e:
            print(f"Warning: {e}")

    for heading in NARRATIVE_SECTION_HEADINGS:
        try:
            section_lines = _section_body(lines, heading)
            narrative = _extract_narrative_text(section_lines)
            if not narrative:
                print(f"Warning: No narrative found in section '{heading}'")
            else:
                print(f"Imported narrative from '{heading}'")
            appendix_lines.extend(
                [
                    f"### **{heading}**",
                    f"* {heading} — Apr 2026 snapshot: {narrative}",
                    "",
                ]
            )
        except ValueError as e:
            print(f"Warning: {e}")

    appendix_lines.append(END_MARKER)
    return "\n".join(appendix_lines).rstrip() + "\n"


def upsert_jobs_appendix(master_text: str, appendix_text: str) -> str:
    if BEGIN_MARKER in master_text and END_MARKER in master_text:
        start = master_text.index(BEGIN_MARKER)
        end = master_text.index(END_MARKER) + len(END_MARKER)
        replacement = appendix_text.rstrip("\n")
        return master_text[:start].rstrip() + "\n\n" + replacement + "\n\n" + master_text[end:].lstrip("\n")

    anchor_index = master_text.find(INSERT_BEFORE)
    if anchor_index == -1:
        raise ValueError(f"Could not find insertion anchor: {INSERT_BEFORE}")

    replacement = appendix_text.rstrip("\n")
    return master_text[:anchor_index].rstrip() + "\n\n" + replacement + "\n\n" + master_text[anchor_index:]


def import_jobs_masterdoc(source_path: Path, target_path: Path) -> None:
    appendix_text = build_jobs_appendix(source_path)
    master_text = target_path.read_text(encoding="utf-8")
    updated_text = upsert_jobs_appendix(master_text, appendix_text)
    target_path.write_text(updated_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import the external AI jobs masterdoc into data/ai_master.md.")
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE_PATH), help="Path to AI_Jobs_Masterdoc.md")
    parser.add_argument("--target", default=str(DEFAULT_TARGET_PATH), help="Target ai_master.md path")
    args = parser.parse_args()

    source_path = Path(args.source).expanduser().resolve()
    target_path = Path(args.target).expanduser().resolve()
    import_jobs_masterdoc(source_path, target_path)
    print(f"Imported jobs appendix from {source_path} into {target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
