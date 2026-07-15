import argparse
import json
from pathlib import Path

from rembg import new_session, remove


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove one image background with a pinned rembg model.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="birefnet-general-lite")
    args = parser.parse_args()

    source = Path(args.input).resolve()
    target = Path(args.output).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Input image does not exist: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)

    session = new_session(args.model, providers=["CPUExecutionProvider"])
    target.write_bytes(remove(source.read_bytes(), session=session, force_return_bytes=True))
    print(json.dumps({"model": args.model, "input": str(source), "output": str(target)}))


if __name__ == "__main__":
    main()
