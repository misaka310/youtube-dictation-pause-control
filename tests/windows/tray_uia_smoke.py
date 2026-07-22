from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import json
import os
import subprocess
import time
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterable

import psutil
from PIL import ImageGrab
from pywinauto import Desktop

APP_NAME = "YouTube Dictation Control"
EXE = Path(os.environ["GUI_SMOKE_EXE"]).resolve()
PACKAGE_ROOT = EXE.parent
LOG_FILE = PACKAGE_ROOT / "logs" / "control.log"
SERVER_SCRIPT = (PACKAGE_ROOT / "server" / "server.js").resolve()
RESULT_DIR = Path(os.environ.get("GUI_SMOKE_RESULT_DIR", Path.cwd() / "test-results" / "windows-gui-smoke"))
EXPECTED_ACTIONS = (
    "Restart local bridge",
    "Reset dictation state",
    "Open log",
    "Start with Windows",
    "Exit",
)

USER32 = ctypes.windll.user32
WM_CLOSE = 0x0010


@dataclass(frozen=True)
class WindowInfo:
    hwnd: int
    pid: int
    title: str
    class_name: str


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    detail: str = ""


def wait_until(description: str, predicate: Callable[[], object], timeout: float = 12.0, interval: float = 0.2):
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            value = predicate()
            if value:
                return value
        except Exception as exc:
            last_error = exc
        time.sleep(interval)
    suffix = f"; last error: {last_error}" if last_error else ""
    raise TimeoutError(f"Timed out waiting for {description}{suffix}")


def enum_top_windows() -> list[WindowInfo]:
    rows: list[WindowInfo] = []
    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)

    def callback(hwnd: int, _lparam: int) -> bool:
        title_length = USER32.GetWindowTextLengthW(hwnd)
        title_buffer = ctypes.create_unicode_buffer(title_length + 1)
        USER32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
        class_buffer = ctypes.create_unicode_buffer(256)
        USER32.GetClassNameW(hwnd, class_buffer, len(class_buffer))
        pid = wt.DWORD()
        USER32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        rows.append(WindowInfo(int(hwnd), int(pid.value), title_buffer.value, class_buffer.value))
        return True

    USER32.EnumWindows(enum_proc(callback), 0)
    return rows


def exact_processes(executable: Path) -> list[psutil.Process]:
    marker = os.path.normcase(str(executable))
    rows: list[psutil.Process] = []
    for process in psutil.process_iter(["pid", "exe", "cmdline"]):
        try:
            process_exe = process.info.get("exe")
            if process_exe and os.path.normcase(os.path.abspath(process_exe)) == marker:
                rows.append(process)
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            continue
    return sorted(rows, key=lambda item: item.pid)


def controller_processes() -> list[psutil.Process]:
    return exact_processes(EXE)


def owned_server_processes() -> list[psutil.Process]:
    marker = os.path.normcase(str(SERVER_SCRIPT))
    rows: list[psutil.Process] = []
    for process in psutil.process_iter(["pid", "cmdline"]):
        try:
            args = [os.path.normcase(os.path.abspath(value)) for value in (process.info.get("cmdline") or [])]
            if marker in args:
                rows.append(process)
        except (psutil.AccessDenied, psutil.NoSuchProcess, OSError):
            continue
    return rows


def launch_app() -> psutil.Process:
    subprocess.Popen([str(EXE)], cwd=PACKAGE_ROOT)
    def find_one_controller():
        found = controller_processes()
        return found if len(found) == 1 else None

    rows = wait_until(
        "one compiled controller process",
        find_one_controller,
        timeout=15,
    )
    return rows[0]


def relaunch_single_instance() -> psutil.Process:
    subprocess.Popen([str(EXE)], cwd=PACKAGE_ROOT)
    time.sleep(2)
    def find_one_controller():
        found = controller_processes()
        return found if len(found) == 1 else None

    rows = wait_until(
        "one controller after duplicate launch",
        find_one_controller,
        timeout=10,
    )
    return rows[0]


def candidate_scopes() -> Iterable[object]:
    desktop = Desktop(backend="uia")
    seen_handles: set[int] = set()

    def add_scope(window):
        try:
            handle = int(window.handle)
            if handle in seen_handles or not window.is_visible():
                return None
            seen_handles.add(handle)
            return window
        except Exception:
            return None

    taskbar = desktop.window(class_name="Shell_TrayWnd")
    if taskbar.exists(timeout=1):
        scope = add_scope(taskbar)
        if scope is not None:
            yield scope

    for class_name in (
        "TopLevelWindowForOverflowXamlIsland",
        "NotifyIconOverflowWindow",
        "Windows.UI.Core.CoreWindow",
        "XamlExplorerHostIslandWindow",
    ):
        for window in desktop.windows(class_name=class_name):
            scope = add_scope(window)
            if scope is not None:
                yield scope

    for row in enum_top_windows():
        marker = f"{row.class_name} {row.title}".casefold()
        if not any(token in marker for token in ("tray", "notify", "overflow", "xaml")):
            continue
        scope = add_scope(desktop.window(handle=row.hwnd))
        if scope is not None:
            yield scope


def element_name(element) -> str:
    for getter in (
        lambda: element.window_text(),
        lambda: element.element_info.name,
    ):
        try:
            value = str(getter() or "").strip()
            if value:
                return value
        except Exception:
            continue
    return ""


def find_named_control(scopes: Iterable[object], predicate: Callable[[str], bool]):
    for scope in scopes:
        try:
            controls = scope.descendants()
        except Exception:
            continue
        for control in controls:
            try:
                if predicate(element_name(control)):
                    return control
            except Exception:
                continue
    return None


def open_hidden_icons_if_needed() -> None:
    taskbar = Desktop(backend="uia").window(class_name="Shell_TrayWnd")
    if not taskbar.exists(timeout=2):
        raise RuntimeError("Windows taskbar was not found; use a logged-in interactive runner session")

    def predicate(text: str) -> bool:
        lowered = text.casefold()
        return "hidden icon" in lowered or "show hidden" in lowered or "非表示のアイコン" in text

    button = find_named_control((taskbar,), predicate)
    if button is not None:
        button.click_input()
        time.sleep(0.7)


def find_tray_button():
    def predicate(text: str) -> bool:
        return APP_NAME.casefold() in text.casefold()

    button = find_named_control(candidate_scopes(), predicate)
    if button is not None:
        return button
    open_hidden_icons_if_needed()
    return wait_until(
        f"{APP_NAME} tray icon",
        lambda: find_named_control(candidate_scopes(), predicate),
        timeout=15,
    )


def find_popup(pid: int) -> WindowInfo | None:
    return next(
        (
            row
            for row in enum_top_windows()
            if row.pid == pid and row.class_name == "#32768" and USER32.IsWindowVisible(row.hwnd)
        ),
        None,
    )


def close_popup(hwnd: int) -> None:
    if USER32.IsWindow(hwnd):
        USER32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
        time.sleep(0.2)


def open_menu(pid: int):
    find_tray_button().click_input(button="right")
    popup = wait_until("AutoHotkey tray menu", lambda: find_popup(pid), timeout=5)
    wrapper = Desktop(backend="uia").window(handle=popup.hwnd)
    wait_until("tray menu items", lambda: wrapper.descendants(control_type="MenuItem"), timeout=3)
    return popup, wrapper


def menu_items(wrapper) -> dict[str, object]:
    result: dict[str, object] = {}
    for item in wrapper.descendants(control_type="MenuItem"):
        text = item.window_text().strip()
        if text:
            result[text] = item
    return result


def assert_menu_contract(pid: int) -> None:
    popup, wrapper = open_menu(pid)
    try:
        items = menu_items(wrapper)
        if not any(title.startswith("Status: ") for title in items):
            raise AssertionError(f"status item missing: {sorted(items)}")
        missing = [title for title in EXPECTED_ACTIONS if title not in items]
        if missing:
            raise AssertionError(f"missing menu actions: {missing}; actual={sorted(items)}")
        disabled = [title for title in EXPECTED_ACTIONS if not items[title].is_enabled()]
        if disabled:
            raise AssertionError(f"unexpected disabled actions: {disabled}")
    finally:
        close_popup(popup.hwnd)


def click_menu_item(pid: int, title: str) -> None:
    popup, wrapper = open_menu(pid)
    item = menu_items(wrapper).get(title)
    if item is None:
        close_popup(popup.hwnd)
        raise AssertionError(f"menu item not found: {title}")
    if not item.is_enabled():
        close_popup(popup.hwnd)
        raise AssertionError(f"menu item is disabled: {title}")
    item.click_input()
    wait_until("tray menu to close", lambda: not USER32.IsWindow(popup.hwnd), timeout=5)


def log_tail_from(offset: int) -> str:
    if not LOG_FILE.exists():
        return ""
    with LOG_FILE.open("rb") as handle:
        handle.seek(offset)
        return handle.read().decode("utf-8-sig", errors="replace")


def verify_logged_action(pid: int, title: str, expected_text: str, timeout: float = 15.0) -> None:
    offset = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    click_menu_item(pid, title)
    wait_until(
        f"{title} log evidence",
        lambda: expected_text in log_tail_from(offset),
        timeout=timeout,
    )
    assert_menu_contract(pid)


def visible_non_controller_windows() -> dict[int, WindowInfo]:
    controller_pids = {process.pid for process in controller_processes()}
    return {
        row.hwnd: row
        for row in enum_top_windows()
        if row.pid not in controller_pids and row.title and USER32.IsWindowVisible(row.hwnd)
    }


def verify_open_log(pid: int) -> None:
    before = set(visible_non_controller_windows())
    click_menu_item(pid, "Open log")

    def find_log_window():
        for hwnd, row in visible_non_controller_windows().items():
            if hwnd not in before and "control.log" in row.title.casefold():
                return row
        return None

    row = wait_until("control.log viewer", find_log_window, timeout=10)
    USER32.PostMessageW(row.hwnd, WM_CLOSE, 0, 0)


def verify_exit(pid: int) -> None:
    server_pids = {process.pid for process in owned_server_processes()}
    click_menu_item(pid, "Exit")
    wait_until("controller exit", lambda: not controller_processes(), timeout=15)
    wait_until(
        "owned Node bridge exit",
        lambda: not any(psutil.pid_exists(server_pid) for server_pid in server_pids),
        timeout=10,
    )


def control_snapshot(control) -> dict[str, object]:
    info = control.element_info
    rectangle = getattr(info, "rectangle", None)
    return {
        "name": element_name(control),
        "controlType": str(getattr(info, "control_type", "") or ""),
        "className": str(getattr(info, "class_name", "") or ""),
        "automationId": str(getattr(info, "automation_id", "") or ""),
        "rectangle": (
            {
                "left": int(rectangle.left),
                "top": int(rectangle.top),
                "right": int(rectangle.right),
                "bottom": int(rectangle.bottom),
            }
            if rectangle is not None
            else None
        ),
    }


def save_uia_diagnostics() -> None:
    diagnostics: dict[str, object] = {
        "sessionName": os.environ.get("SESSIONNAME", ""),
        "scopes": [],
        "topWindows": [],
    }
    scope_rows: list[dict[str, object]] = []
    for scope in candidate_scopes():
        try:
            descendants = scope.descendants()
            scope_rows.append(
                {
                    "scope": control_snapshot(scope),
                    "descendants": [control_snapshot(control) for control in descendants[:500]],
                    "truncated": len(descendants) > 500,
                }
            )
        except Exception as exc:
            scope_rows.append({"error": f"{type(exc).__name__}: {exc}"})
    diagnostics["scopes"] = scope_rows

    diagnostics["topWindows"] = [
        asdict(row)
        for row in enum_top_windows()
        if row.pid == os.getpid()
        or any(
            token in f"{row.class_name} {row.title}".casefold()
            for token in ("shell", "tray", "notify", "overflow", "xaml")
        )
    ][:500]
    (RESULT_DIR / "uia-diagnostics.json").write_text(
        json.dumps(diagnostics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def save_result(results: list[ScenarioResult], error: BaseException | None = None) -> None:
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"ok": error is None, "results": [asdict(result) for result in results]}
    if error is not None:
        payload["error"] = f"{type(error).__name__}: {error}"
        payload["traceback"] = traceback.format_exc()
        try:
            save_uia_diagnostics()
        except Exception as diagnostic_error:
            payload["uiaDiagnosticsError"] = f"{type(diagnostic_error).__name__}: {diagnostic_error}"
        try:
            ImageGrab.grab(all_screens=True).save(RESULT_DIR / "failure.png")
        except Exception:
            pass
    (RESULT_DIR / "result.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_scenario(results: list[ScenarioResult], name: str, action: Callable[[], None]) -> None:
    try:
        action()
    except Exception as exc:
        results.append(ScenarioResult(name, False, str(exc)))
        print(f"FAIL {name}: {exc}", flush=True)
        raise
    results.append(ScenarioResult(name, True))
    print(f"PASS {name}", flush=True)


def cleanup_owned_processes() -> None:
    processes = controller_processes() + owned_server_processes()
    for process in processes:
        try:
            process.terminate()
        except psutil.NoSuchProcess:
            pass
    psutil.wait_procs(processes, timeout=5)


def main() -> int:
    if os.name != "nt":
        print("FAIL environment: Windows is required", flush=True)
        return 2
    if not EXE.is_file():
        print(f"FAIL environment: missing {EXE}", flush=True)
        return 2
    if controller_processes():
        print("FAIL environment: this packaged controller is already running", flush=True)
        return 2

    results: list[ScenarioResult] = []
    try:
        process = launch_app()
        pid = process.pid
        run_scenario(results, "packaged controller starts", lambda: None)
        run_scenario(results, "tray menu contract", lambda: assert_menu_contract(pid))

        replacement: list[psutil.Process] = []

        def duplicate_launch() -> None:
            replacement.append(relaunch_single_instance())

        run_scenario(results, "single tray instance after duplicate launch", duplicate_launch)
        pid = replacement[0].pid
        run_scenario(
            results,
            "reset dictation action",
            lambda: verify_logged_action(pid, "Reset dictation state", "manual state reset: all dictation states -> inactive"),
        )
        run_scenario(
            results,
            "restart bridge action",
            lambda: verify_logged_action(pid, "Restart local bridge", "Started owned Node bridge PID", timeout=20),
        )
        run_scenario(results, "open log action", lambda: verify_open_log(pid))
        run_scenario(results, "clean exit", lambda: verify_exit(pid))

        second = launch_app()
        run_scenario(results, "second launch remains operable", lambda: assert_menu_contract(second.pid))
        run_scenario(results, "second clean exit", lambda: verify_exit(second.pid))
        save_result(results)
        return 0
    except Exception as exc:
        save_result(results, exc)
        return 1
    finally:
        cleanup_owned_processes()


if __name__ == "__main__":
    raise SystemExit(main())
