"""Narrow macOS Keychain bridge. Secrets enter/leave only via captured process pipes."""
import ctypes
import json
import sys

request = json.load(sys.stdin)
role = request.get("role")
if role not in ("deployer", "relayer", "borrower"):
    raise SystemExit("Unsupported AttestLock testnet account")
security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
service = b"org.attestlock.testnet.2026"
account = role.encode()
if request.get("operation") == "add":
    password = request["password"].encode()
    function = security.SecKeychainAddGenericPassword
    function.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_void_p]
    function.restype = ctypes.c_int32
    status = function(None, len(service), service, len(account), account, len(password), password, None)
    if status != 0:
        raise SystemExit(f"Keychain add failed ({status}); no existing credential was overwritten")
elif request.get("operation") == "get":
    length = ctypes.c_uint32()
    data = ctypes.c_void_p()
    function = security.SecKeychainFindGenericPassword
    function.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    function.restype = ctypes.c_int32
    status = function(None, len(service), service, len(account), account, ctypes.byref(length), ctypes.byref(data), None)
    if status != 0:
        raise SystemExit(f"Keychain read failed ({status}); unlock the dedicated account in Keychain Access")
    sys.stdout.buffer.write(ctypes.string_at(data, length.value))
    security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    security.SecKeychainItemFreeContent(None, data)
else:
    raise SystemExit("Unsupported operation")
