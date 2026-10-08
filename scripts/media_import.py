"""Move local MP4 originals into the library; expose progress without source paths."""
import errno
import hashlib
import os
from pathlib import Path
import shutil
import threading
import unicodedata
import uuid
from urllib.parse import quote

MAX_BYTES = 15 * 1024 ** 3
CHUNK_BYTES = 1024 * 1024
MAX_RETAINED = 256
MP4_BRANDS = {b'isom', b'iso2', b'iso3', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1', b'dash', b'M4V '}
WINDOWS_RESERVED = {'con', 'prn', 'aux', 'nul', *(f'com{i}' for i in range(1, 10)), *(f'lpt{i}' for i in range(1, 10))}


def slug_title(title):
    if not isinstance(title, str) or not title.strip() or len(title) > 100:
        raise ValueError('library.invalid')
    normalized = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
    slug = ''.join(character if character.isalnum() and character.isascii() else '-' for character in normalized)
    slug = '-'.join(part for part in slug.split('-') if part)[:100].rstrip('-')
    if not slug:
        slug = 'titulo-' + hashlib.sha256(title.strip().encode('utf-8')).hexdigest()[:12]
    return f'titulo-{slug}' if slug in WINDOWS_RESERVED else slug


def validate_mp4(path):
    """Validate extension, size and ISO BMFF ftyp before touching the original."""
    if path.is_symlink() or not path.is_file():
        raise ValueError('library.sourceUnavailable')
    if path.suffix.lower() != '.mp4':
        raise ValueError('library.mp4Required')
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise ValueError('library.videoTooLarge')
    if size < 20:
        raise ValueError('library.mp4Invalid')
    with path.open('rb') as stream:
        header = stream.read(min(4096, size))
    if len(header) < 20 or header[4:8] != b'ftyp':
        raise ValueError('library.mp4Invalid')
    box = int.from_bytes(header[:4], 'big')
    offset = 16 if box == 1 else 8
    if box == 1:
        box = int.from_bytes(header[8:16], 'big')
    if box < offset + 8 or box > len(header) or (box - offset - 8) % 4:
        raise ValueError('library.mp4Invalid')
    brands = [header[offset:offset + 4]] + [header[i:i + 4] for i in range(offset + 8, box, 4)]
    if brands[0] == b'qt  ' or not any(brand in MP4_BRANDS for brand in brands):
        raise ValueError('library.mp4Invalid')
    return size


def _same_volume(source, destination):
    return source.stat().st_dev == destination.parent.stat().st_dev


def _fingerprint(path):
    details = path.stat()
    return (details.st_size, details.st_mtime_ns, details.st_ino, details.st_dev)


def _rename_no_replace(source, destination):
    # Windows rename refuses an existing target. POSIX link/unlink has the same
    # no-overwrite property, including an external file created during import.
    if os.name == 'nt':
        os.rename(source, destination)
    else:
        os.link(source, destination)
        try:
            source.unlink()
        except OSError:
            destination.unlink()
            raise


class MediaImports:
    def __init__(self, root, pick_fn=None):
        self.root = Path(root).resolve()
        self.pick_fn = pick_fn
        self._lock = threading.RLock()
        self._sources = {}
        self._fingerprints = {}
        self._jobs = {}
        self._active_sources = set()
        self._active_destinations = set()

    def register(self, path):
        if not isinstance(path, (str, os.PathLike)) or not str(path).strip():
            raise ValueError('library.sourceUnavailable')
        original = Path(path)
        if not original.is_absolute():
            raise ValueError('library.sourceUnavailable')
        if original.is_symlink() or any(parent.is_symlink() for parent in original.parents):
            raise ValueError('library.sourceUnavailable')
        source = original.resolve()
        try:
            fingerprint = _fingerprint(source)
            size = validate_mp4(source)
            if _fingerprint(source) != fingerprint:
                raise ValueError('library.sourceChanged')
        except PermissionError as error:
            raise ValueError('library.permissionDenied') from error
        except OSError as error:
            raise ValueError('library.sourceUnavailable') from error
        token = uuid.uuid4().hex
        with self._lock:
            self._sources[token] = source
            self._fingerprints[token] = fingerprint
            self._prune()
        return {'sourceToken': token, 'name': source.name, 'size': size, 'url': f'/api/media/source/{token}'}

    def pick(self):
        if self.pick_fn is not None:
            path = self.pick_fn()
        else:
            # No native window is opened until the user presses Choose.
            import tkinter
            from tkinter import filedialog
            window = tkinter.Tk()
            window.withdraw()
            window.attributes('-topmost', True)
            try:
                path = filedialog.askopenfilename(parent=window, title='Elegir video MP4 original', filetypes=[('Video MP4', '*.mp4')])
            finally:
                window.destroy()
        if not path:
            return None
        return self.register(path)

    def source(self, token):
        with self._lock:
            source = self._sources.get(token)
        return source if source and source.is_file() and not source.is_symlink() else None

    def _prune(self):
        """Bound idle records without invalidating a currently running import."""
        for token, path in list(self._sources.items()):
            if len(self._sources) <= MAX_RETAINED:
                break
            if path not in self._active_sources:
                del self._sources[token]
                self._fingerprints.pop(token, None)
        for identifier, entry in list(self._jobs.items()):
            if len(self._jobs) <= MAX_RETAINED:
                break
            if entry['snapshot']['status'] != 'active':
                del self._jobs[identifier]

    def _destination(self, data):
        slug = slug_title(data.get('title'))
        kind = data.get('kind')
        if kind == 'movie':
            folder, filename = 'videos', f'{slug}.mp4'
        elif kind == 'series':
            season, number = data.get('season'), data.get('number')
            if type(season) is not int or not 1 <= season <= 99 or type(number) is not int or not 1 <= number <= 999:
                raise ValueError('library.invalid')
            folder = 'series'
            filename = f'{slug}_#{number}.mp4' if season == 1 else f'{slug}_T{season}_#{number}.mp4'
        else:
            raise ValueError('library.invalid')
        directory = self.root / folder
        if directory.is_symlink():
            raise ValueError('library.permissionDenied')
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / filename
        if destination.is_symlink():
            raise ValueError('library.permissionDenied')
        try:
            destination.resolve().relative_to(self.root)
        except ValueError as error:
            raise ValueError('library.permissionDenied') from error
        return destination

    def start(self, data):
        if not isinstance(data, dict):
            raise ValueError('library.invalid')
        with self._lock:
            token = data.get('sourceToken')
            if not isinstance(token, str):
                raise ValueError('library.sourceUnavailable')
            source = self._sources.get(token)
            if source is None:
                raise ValueError('library.sourceUnavailable')
            try:
                total = validate_mp4(source)
                fingerprint = _fingerprint(source)
                if fingerprint != self._fingerprints.get(token):
                    raise ValueError('library.sourceChanged')
                destination = self._destination(data)
            except PermissionError as error:
                raise ValueError('library.permissionDenied') from error
            except OSError as error:
                raise ValueError('library.sourceUnavailable') from error
            same_file = destination.exists() and os.path.samefile(source, destination)
            if destination.exists() and not same_file:
                raise ValueError('library.destinationExists')
            if source in self._active_sources or destination in self._active_destinations:
                raise ValueError('library.importBusy')
            identifier = uuid.uuid4().hex
            job = {'id': identifier, 'status': 'active', 'loaded': 0, 'total': total, 'phase': 'moving'}
            self._jobs[identifier] = {'snapshot': job, 'cancel': threading.Event()}
            self._active_sources.add(source)
            self._active_destinations.add(destination)
            self._prune()
        thread = threading.Thread(target=self._run, args=(identifier, source, destination, same_file, fingerprint), daemon=True)
        thread.start()
        return {'id': identifier}

    def get(self, identifier):
        with self._lock:
            job = self._jobs.get(identifier)
            if job is None:
                return None
            snapshot = dict(job['snapshot'])
            if 'result' in snapshot:
                snapshot['result'] = dict(snapshot['result'])
            return snapshot

    def cancel(self, identifier):
        with self._lock:
            job = self._jobs.get(identifier)
            if job is None:
                return None
            if job['snapshot']['status'] == 'active' and job['snapshot']['phase'] != 'confirming':
                job['cancel'].set()
        return self.get(identifier)

    def _update(self, identifier, **changes):
        with self._lock:
            self._jobs[identifier]['snapshot'].update(changes)

    def _begin_commit(self, identifier):
        with self._lock:
            job = self._jobs[identifier]
            if job['cancel'].is_set():
                return False
            job['snapshot']['phase'] = 'confirming'
            return True

    def _run(self, identifier, source, destination, same_file, fingerprint):
        try:
            total = validate_mp4(source)
            if total != self.get(identifier)['total'] or _fingerprint(source) != fingerprint:
                raise ValueError('library.sourceChanged')
            if same_file:
                if not self._begin_commit(identifier):
                    self._update(identifier, status='cancelled')
                    return
            elif _same_volume(source, destination):
                if not self._begin_commit(identifier):
                    self._update(identifier, status='cancelled')
                    return
                try:
                    _rename_no_replace(source, destination)
                except OSError as error:
                    if error.errno != errno.EXDEV:
                        raise
                    # Actual rename is authoritative when st_dev cannot identify
                    # a Windows mount boundary. Restore cancellability for copy.
                    self._update(identifier, phase='copying')
                    self._copy(identifier, source, destination, total)
            else:
                self._copy(identifier, source, destination, total)
            result = {'url': quote(destination.relative_to(self.root).as_posix(), safe='/'), 'name': destination.name, 'size': total}
            self._update(identifier, status='ready', loaded=total, phase='confirming', result=result)
        except InterruptedError:
            self._update(identifier, status='cancelled')
        except Exception as error:
            key = str(error) if isinstance(error, ValueError) and str(error).startswith('library.') else 'library.sourceError'
            if isinstance(error, FileExistsError):
                key = 'library.destinationExists'
            elif isinstance(error, PermissionError):
                key = 'library.permissionDenied'
            elif isinstance(error, FileNotFoundError):
                key = 'library.sourceUnavailable'
            elif isinstance(error, OSError) and error.errno == errno.ENOSPC:
                key = 'library.spaceError'
            self._update(identifier, status='error', error=key)
        finally:
            with self._lock:
                self._active_sources.discard(source)
                self._active_destinations.discard(destination)
                self._prune()

    def _copy(self, identifier, source, destination, total):
        self._update(identifier, phase='copying')
        if shutil.disk_usage(destination.parent).free < total:
            raise ValueError('library.spaceError')
        temporary = destination.parent / f'.{identifier}.part'
        committed = False
        initial = source.stat()
        try:
            loaded = 0
            with source.open('rb') as original, temporary.open('xb') as target:
                while True:
                    if self._jobs[identifier]['cancel'].is_set():
                        raise InterruptedError()
                    chunk = original.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    target.write(chunk)
                    loaded += len(chunk)
                    self._update(identifier, loaded=loaded)
                target.flush()
                os.fsync(target.fileno())
            current = source.stat()
            if loaded != total or temporary.stat().st_size != total or current.st_size != initial.st_size or current.st_mtime_ns != initial.st_mtime_ns:
                raise ValueError('library.sourceChanged')
            if not self._begin_commit(identifier):
                raise InterruptedError()
            _rename_no_replace(temporary, destination)
            committed = True
            try:
                source.unlink()
            except OSError:
                # Roll back our new destination if Windows refuses to remove
                # an original currently open elsewhere; never leave duplicates.
                destination.unlink()
                committed = False
                raise
        finally:
            if not committed:
                temporary.unlink(missing_ok=True)
