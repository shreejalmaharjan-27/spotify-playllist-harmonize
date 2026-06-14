#!/usr/bin/env python
"""DJ-Set orchestrator.

Pipeline (each stage is cached / resumable):

    python cli.py download [--limit N] [--workers 4]
    python cli.py analyze  [--limit N] [--workers N]
    python cli.py sequence [--playlist "Name"]   # also creates the Spotify playlist
    python cli.py play     [--pos 0]             # start playback on active device
    python cli.py serve    [--port 8000]         # dashboard + auto-DJ
    python cli.py all                            # download -> analyze -> sequence

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
    s = sub.add_parser("sequence"); s.add_argument("--playlist", default="DJ Set (harmonic)")
    s.add_argument("--no-playlist", action="store_true")
    pl = sub.add_parser("play"); pl.add_argument("--pos", type=int, default=0)
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
        if not args.no_playlist:
            from djset import spotify_client
            sp = spotify_client.client()
            spotify_client.create_playlist(sp, name=args.playlist)
    elif args.cmd == "play":
        from djset import spotify_client
        sp = spotify_client.client()
        spotify_client.start_playback(sp, start_pos=args.pos)
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
