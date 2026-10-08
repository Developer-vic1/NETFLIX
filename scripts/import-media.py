"""Move a complete MP4 into the project's organized media folders."""
import argparse
from pathlib import Path
import time
from media_import import MediaImports

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--title', required=True)
parser.add_argument('--kind', choices=['movie', 'series'], default='movie')
parser.add_argument('--season', type=int, default=1)
parser.add_argument('--episode', type=int, default=1)
args = parser.parse_args()
imports = MediaImports(Path(__file__).resolve().parent.parent)
try:
    source = imports.register(args.source)
    identifier = imports.start({'sourceToken': source['sourceToken'], 'title': args.title, 'kind': args.kind, 'season': args.season, 'number': args.episode})['id']
    while True:
        job = imports.get(identifier)
        print(f"{job['status']}: {job['loaded']}/{job['total']} bytes", flush=True)
        if job['status'] != 'active':
            if job['status'] != 'ready':
                raise ValueError(job.get('error', 'library.moveError'))
            print(f"Video completo trasladado a: {job['result']['url']}")
            break
        time.sleep(0.5)
except (ValueError, OSError) as error:
    parser.exit(1, f'No se movió el video: {error}\n')
