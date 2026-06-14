#!/usr/bin/env python
"""DJ-Set orchestrator.

Pipeline (each stage is cached / resumable):

    python cli.py download [--limit N] [--workers 4]
    python cli.py analyze  [--limit N] [--workers N]
    python cli.py sequence                       # offline preview order -> set_order.json
    python cli.py serve    [--port 8000]         # dashboard: pick a playlist, it DJs it
    python cli.py all                            # download -> analyze -> sequence

Playlist selection and playback happen in the dashboard (cli.py serve): you
pick one of your Spotify playlists and it plays the DJ-ordered tracks on your
desktop app. No new playlist is created.

Run inside the djset conda env:  conda run -n djset python cli.py <stage>
"""
import argparse


def main():
    p = argparse.ArgumentParser(description="Harmonic DJ-set mixer for Spotify")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("download"); d.add_argument("--limit", type=int)
    d.add_argument("--workers", type=int, default=4)
    a = sub.add_parser("analyze"); a.add_argument("--limit", type=int)
    a.add_argument("--workers", type=int, default=None)
    sub.add_parser("sequence")
    sv = sub.add_parser("serve"); sv.add_argument("--port", type=int, default=8000)
    al = sub.add_parser("all"); al.add_argument("--limit", type=int)

    args = p.parse_args()

    if args.cmd == "download":
        from djset import download
        download.run(limit=args.limit, workers=args.workers)
    elif args.cmd == "analyze":
        from djset import analyze
        analyze.run(limit=args.limit, workers=args.workers)
    elif args.cmd == "sequence":
        from djset import sequence
        sequence.run()
    elif args.cmd == "serve":
        from djset import server
        server.serve(port=args.port)
    elif args.cmd == "all":
        from djset import download, analyze, sequence
        download.run(limit=args.limit)
        analyze.run(limit=args.limit)
        sequence.run()


if __name__ == "__main__":
    main()
