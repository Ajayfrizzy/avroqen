#!/usr/bin/env python3
"""OWNER EXECUTION ONLY. Merely importing this module performs no I/O.

Run only in a private, non-recorded macOS Terminal after source review:
  See OWNER_EXECUTION.md: a NEW authorization and NEW secured directory are required.

No retry/resume mode. Never clear the attempt directory to rerun after uncertainty.
CLI output is discarded, not captured or logged. Public numbered JSON checkpoints persist phases
and the transaction hash; signed.json is an executable authorization, never share it.
No key removal, funding, manifest writes, or automatic success claims occur here.
"""
import base64
import hashlib
import json
from itertools import count
import os
from pathlib import Path
import pwd
import re
import resource
import stat
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit

ACCOUNT = "avroqen-vault.testnet"
PRIMARY = "ed25519:8mdwv8CXTf2w5QyP9XwqcJzsPaFVQ5K6vh4fWRxcEpVz"
TESTING = "ed25519:5hdgdb9oA4sQGYGgzyfsVSY8xvju3vAFhvovcdvTEn6G"
CLI = Path("/opt/homebrew/Cellar/near/0.31.0/bin/near")
CLI_HASH = "223203d439644cfe4fa077360a9d5161534dd02194e6b773397f89da07789088"
WASM_HASH = "b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48"
WASM_SIZE = 366735
REFERENCE_HASH = "341541adcca55139851e2513bb92f1a4ba6676a00fb5a09ebbbb3862fb0c5e88"
REFERENCE = Path("/private/tmp/avroqen-signing-candidate.json")
RETIRED_WORK = Path("/private/tmp/avroqen-deploy.MK0sOA")
WORK = None  # No default execution directory; never reuse an earlier attempt.
RPC = "https://rpc.testnet.near.org"
ARGS = b'{"network":"testnet"}'
GAS = 100000000000000
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
RPC_REQUEST_IDS = count(1)


class Stop(Exception):
    """Only fixed, non-sensitive error codes may reach the terminal."""


def need(condition, code):
    if not condition:
        raise Stop(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def b58encode(data):
    value, result = int.from_bytes(data, "big"), ""
    while value:
        value, rem = divmod(value, 58)
        result = ALPHABET[rem] + result
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + result


def b58decode(value):
    need(isinstance(value, str) and 1 <= len(value) <= 44, "BASE58_INVALID")
    number = 0
    for char in value:
        need(char in ALPHABET, "BASE58_INVALID")
        number = number * 58 + ALPHABET.index(char)
    data = b"\0" * (len(value) - len(value.lstrip("1")))
    data += number.to_bytes((number.bit_length() + 7) // 8, "big")
    need(len(data) == 32 and b58encode(data) == value, "BASE58_INVALID")
    return data


def unique_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result, "DUPLICATE_JSON_KEY")
            result[key] = value
        return result
    def nonfinite(_value):
        raise Stop("NONFINITE_JSON_NUMBER")
    return json.loads(data, object_pairs_hook=pairs, parse_constant=nonfinite)


def unbase64(value):
    need(isinstance(value, str) and len(value) <= 1000000, "BASE64_INVALID")
    raw = base64.b64decode(value, validate=True)
    need(base64.b64encode(raw).decode() == value, "BASE64_NONCANONICAL")
    return raw


def vec(data):
    return len(data).to_bytes(4, "little") + data


def construct(wasm, nonce, block):
    need(type(nonce) is int and 0 < nonce < 2**64, "NONCE_INVALID")
    need(len(block) == 32, "BLOCK_INVALID")
    return (vec(ACCOUNT.encode()) + b"\0" + b58decode(TESTING[8:])
            + nonce.to_bytes(8, "little") + vec(ACCOUNT.encode()) + block
            + (2).to_bytes(4, "little") + b"\1" + vec(wasm)
            + b"\2" + vec(b"new") + vec(ARGS)
            + GAS.to_bytes(8, "little") + (0).to_bytes(16, "little"))


def decode(raw, wasm):
    """Independent bounded Borsh reader. Returns parsed fields AND derived spans."""
    pos = 0
    spans = {}
    def take(n):
        nonlocal pos
        need(0 <= n <= len(raw) - pos, "BORSH_TRUNCATED")
        data = raw[pos:pos+n]
        pos += n
        return data
    def integer(n):
        return int.from_bytes(take(n), "little")
    def blob():
        return take(integer(4))
    need(blob() == ACCOUNT.encode(), "SIGNER_MISMATCH")
    need(integer(1) == 0, "NOT_ED25519_V0")
    need(take(32) == b58decode(TESTING[8:]), "SIGNING_KEY_MISMATCH")
    start = pos
    nonce = integer(8)
    spans["nonce"] = (start, pos)
    need(0 < nonce < 2**64, "NONCE_INVALID")
    need(blob() == ACCOUNT.encode(), "RECEIVER_MISMATCH")
    start = pos
    block = take(32)
    spans["block"] = (start, pos)
    need(integer(4) == 2, "ACTION_COUNT")
    need(integer(1) == 1, "DEPLOY_ORDER")
    code = blob()
    need(len(code) == WASM_SIZE and code == wasm and sha(code) == WASM_HASH,
         "WASM_MISMATCH")
    need(integer(1) == 2, "CALL_ORDER")
    need(blob() == b"new" and blob() == ARGS, "INIT_MISMATCH")
    need(integer(8) == GAS and integer(16) == 0, "GAS_OR_DEPOSIT")
    need(pos == len(raw), "TRAILING_DATA")
    need(construct(wasm, nonce, block) == raw, "NONCANONICAL_V0")
    return nonce, block, spans


def compare_reference(raw, reference, wasm, nonce, block):
    old_nonce, old_block, old_spans = decode(reference, wasm)
    new_nonce, new_block, new_spans = decode(raw, wasm)
    need(new_nonce == nonce and new_block == block, "REFRESH_MISMATCH")
    need(old_spans == new_spans and len(raw) == len(reference), "LAYOUT_CHANGED")
    # The locations come from parsing, never a constant nonce offset (58 or otherwise).
    normalized = bytearray(raw)
    for start, end in old_spans.values():
        normalized[start:end] = reference[start:end]
    need(bytes(normalized) == reference, "NON_REFRESH_TERMS_CHANGED")
    return old_nonce, old_block


def no_symlinks(path):
    need(path.is_absolute(), "ABSOLUTE_PATH_REQUIRED")
    for part in [*reversed(path.parents), path]:
        info = part.lstat()
        need(not stat.S_ISLNK(info.st_mode), "SYMLINK_DENIED")


def read_regular(path, mode=None, owner=True, limit=2000000):
    no_symlinks(path)
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "UNSAFE_FILE")
        need(not owner or info.st_uid == os.getuid(), "WRONG_FILE_OWNER")
        need(info.st_mode & 0o022 == 0, "WRITABLE_BY_OTHERS")
        need(mode is None or stat.S_IMODE(info.st_mode) == mode, "FILE_MODE")
        need(info.st_size <= limit, "FILE_TOO_LARGE")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(limit+1)
        need(len(data) == info.st_size, "FILE_CHANGED")
        need(os.stat(path, follow_symlinks=False).st_ino == info.st_ino,
             "FILE_REPLACED")
        return data
    finally:
        os.close(fd)


def configure_attempt(argv):
    # Pure lexical validation: never inspect the retired or proposed directory here.
    need(len(argv) == 5 and argv[0] == "--execute-once" and argv[1] == "--work-dir"
         and argv[3] == "--authorization-ref", "NEW_DIRECTORY_AND_AUTHORIZATION_REQUIRED")
    path = Path(argv[2])
    need(str(path) == argv[2] and path.parent == Path("/private/tmp")
         and re.fullmatch(r"avroqen-deploy\.[A-Za-z0-9_-]{6,64}", path.name)
         and path != RETIRED_WORK, "NEW_EXECUTION_DIRECTORY_REQUIRED")
    ref = argv[4]
    need(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{7,79}", ref), "NEW_AUTHORIZATION_REFERENCE_REQUIRED")
    return path, ref


def check_work(empty=False):
    no_symlinks(WORK)
    info = WORK.stat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
         and stat.S_IMODE(info.st_mode) == 0o700, "UNSAFE_WORK_DIRECTORY")
    if empty:
        need(not any(WORK.iterdir()), "DIRECTORY_NOT_EMPTY_NO_RETRY")
    return info.st_dev, info.st_ino


def write_new(path, data):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def event(name, data):
    # Append-only, exclusive public checkpoints. Never accept CLI output here.
    write_new(WORK / (name + ".json"), json.dumps(data, sort_keys=True).encode())


def config_validate(raw):
    """Strict subset of CLI-generated TOML, not a permissive TOML approximation.

    Only bare field names, [network_connection.NAME], and unescaped single-line
    strings are accepted. Unsupported but valid TOML fails closed before near.
    All networks must deserialize successfully, so CLI cannot default on errors.
    """
    sections = {"root": {}}
    section = sections["root"]
    for line in raw.decode("utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        table = re.fullmatch(r"\[network_connection\.([A-Za-z0-9_-]+)\]", line)
        if table:
            name = table[1]
            need(name not in sections, "DUPLICATE_CONFIG_SECTION")
            section = sections.setdefault(name, {})
            continue
        field = re.fullmatch(r'''([a-z_]+)\s*=\s*(["'])([^\\\x00-\x1f"']*)\2''', line)
        need(field is not None, "UNSUPPORTED_CONFIG_SYNTAX")
        key, value = field[1], field[3]
        need(key not in section, "DUPLICATE_CONFIG_FIELD")
        section[key] = value
    need(sections["root"] == {"version": "5", "credentials_home_dir": "/dev/null/avroqen-no-legacy"},
         "CONFIG_VERSION_OR_LEGACY_ROOT")
    required = {"network_name", "rpc_url", "wallet_url", "explorer_transaction_url"}
    urls = {"rpc_url", "wallet_url", "explorer_transaction_url", "faucet_url",
            "fastnear_url", "coingecko_url", "nearblocks_url"}
    accounts = {"linkdrop_account_id", "near_social_db_contract_account_id",
                "staking_pools_factory_account_id", "mpc_contract_account_id"}
    need("testnet" in sections, "TESTNET_CONFIG_MISSING")
    for name, config in sections.items():
        if name == "root":
            continue
        need(required <= set(config) and set(config) <= required | urls | accounts,
             "CONFIG_UNSUPPORTED_OR_CREDENTIAL_FIELD")
        for key, value in config.items():
            if key in urls:
                url = urlsplit(value)
                need(url.scheme == "https" and url.hostname and not url.username
                     and not url.password and not url.fragment, "CONFIG_URL_INVALID")
            if key in accounts:
                need(2 <= len(value) <= 64 and re.fullmatch(r"[a-z0-9]+(?:[._-][a-z0-9]+)*", value),
                     "CONFIG_ACCOUNT_INVALID")
    testnet = sections["testnet"]
    need(testnet["network_name"] == "testnet" and testnet["rpc_url"] in (RPC, RPC+"/"),
         "CONFIG_TESTNET_ENDPOINT")
    # Relayer, rpc_api_key, unreviewed tx status, and other unknown fields rejected.
    need(stat.S_ISCHR(os.stat("/dev/null").st_mode) and not os.path.isdir("/dev/null"),
         "LEGACY_ISOLATION_INVALID")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Stop("RPC_REDIRECT_DENIED")


def rpc(method, params):
    need(method in {"status", "block", "query", "EXPERIMENTAL_protocol_config", "gas_price"},
         "RPC_METHOD_DENIED")
    if method == "query":
        need(params.get("request_type") in {"view_account", "view_access_key_list", "view_access_key"}
             and params.get("account_id") == ACCOUNT, "RPC_QUERY_DENIED")
    request_id = "owner-preflight-" + str(next(RPC_REQUEST_IDS))
    request = urllib.request.Request(RPC, json.dumps({"jsonrpc":"2.0", "id":request_id,
                                                     "method":method,"params":params}).encode(),
                                     {"Content-Type":"application/json"})
    # No ambient proxy credentials, redirects, custom CA overrides or retry loops.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=20) as response:
        need(response.status == 200 and response.url in (RPC, RPC+"/"), "RPC_HTTP_FAILED")
        data = response.read(2000001)
    need(len(data) <= 2000000, "RPC_TOO_LARGE")
    result = unique_json(data)
    need(isinstance(result, dict) and set(result) == {"jsonrpc", "id", "result"}
         and result["jsonrpc"] == "2.0" and result["id"] == request_id
         and isinstance(result["result"], dict), "RPC_FAILED")
    return result["result"]


def uint(value, bits=128):
    need(isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value), "INVALID_ATOMIC_INTEGER")
    number = int(value)
    need(number < 2**bits, "INTEGER_OVERFLOW")
    return number


def fresh(header):
    stamp = uint(header["timestamp_nanosec"])
    age = time.time_ns() - stamp
    need(-5000000000 <= age <= 120000000000, "STALE_FINALIZED_BLOCK")
    need(type(header["height"]) is int and header["height"] > 0, "INVALID_BLOCK_HEIGHT")
    b58decode(header["hash"])


def preflight():
    need(rpc("status", [])["chain_id"] == "testnet", "WRONG_CHAIN")
    header = rpc("block", {"finality":"final"})["header"]
    fresh(header)
    header = {key: header[key] for key in ("hash", "height", "timestamp_nanosec")}
    block = header["hash"]
    def query(kind, **extra):
        result = rpc("query", dict(request_type=kind, block_id=block, account_id=ACCOUNT, **extra))
        need(result["block_hash"] == block and result["block_height"] == header["height"], "UNPINNED_QUERY")
        return result
    account = query("view_account")
    keys = query("view_access_key_list")["keys"]
    need(len(keys) == 2 and {k["public_key"] for k in keys} == {PRIMARY, TESTING}
         and all(k["access_key"]["permission"] == "FullAccess" for k in keys), "KEY_SET_CHANGED")
    access = query("view_access_key", public_key=TESTING)
    need(access["permission"] == "FullAccess" and type(access["nonce"]) is int
         and 0 <= access["nonce"] < 2**64-1, "TESTING_KEY_INVALID")
    need(next(k["access_key"]["nonce"] for k in keys if k["public_key"] == TESTING) == access["nonce"],
         "NONCE_OBSERVATION_MISMATCH")
    protocol = rpc("EXPERIMENTAL_protocol_config", {"block_id":block})
    gas = rpc("gas_price", [block])
    validity = protocol["transaction_validity_period"]
    need(type(validity) is int and validity > 0, "VALIDITY_PERIOD_INVALID")
    need(protocol["protocol_version"] == 88 and protocol["runtime_config"]["storage_amount_per_byte"] == "10000000000000000000"
         and gas["gas_price"] == "100000000", "PARAMETERS_CHANGED")
    need(account["code_hash"] == "11111111111111111111111111111111" and uint(account["locked"]) == 0,
         "ALREADY_DEPLOYED_OR_STAKED")
    storage = account["storage_usage"]
    need(type(storage) is int and 0 <= storage <= 1000000, "STORAGE_INVALID")
    minimum = (storage + WASM_SIZE + 351) * 10**19 + 33 * 10**22
    need(uint(account["amount"]) >= minimum, "INSUFFICIENT_BACKING")
    fresh(header)
    return {"header":header,"nonce":access["nonce"]+1,"minimum":str(minimum),"balance":account["amount"],"validity":validity}


SWIFT_VERIFY = r'''
import Foundation
import CryptoKit
import Darwin
@main struct Verify {
    static func main() {
        // Public key + digest + signature arrive only through an anonymous pipe.
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard input.count == 128 else { exit(1) }
        do {
            let key = try Curve25519.Signing.PublicKey(rawRepresentation: input.prefix(32))
            guard key.isValidSignature(input.suffix(64), for: input.dropFirst(32).prefix(32)) else { exit(1) }
        } catch { exit(1) }
    }
}
'''


def child(command, env, input_data=None, timeout=180):
    # Never expose credential-bearing stderr/stdout, including failure/timeout paths.
    result = subprocess.run(command, input=input_data, stdin=subprocess.DEVNULL if input_data is None else None,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
                            cwd=str(WORK), timeout=timeout, check=False)
    need(result.returncode == 0, "SUBPROCESS_FAILED_STOP_NO_RETRY")


def verify_signed(data, raw):
    envelope = unique_json(data)
    need(isinstance(envelope, dict) and set(envelope) == {"signed_transaction_as_base64"}, "SIGNED_ENVELOPE_INVALID")
    serialized = unbase64(envelope["signed_transaction_as_base64"])
    need(len(serialized) == len(raw)+65 and serialized[:len(raw)] == raw
         and serialized[len(raw)] == 0, "SIGNED_TRANSACTION_MISMATCH")
    return serialized[-64:]


def execute(authorization_ref):
    need(isinstance(authorization_ref, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{7,79}", authorization_ref),
         "NEW_AUTHORIZATION_REFERENCE_REQUIRED")
    need(isinstance(WORK, Path) and WORK != RETIRED_WORK, "NEW_EXECUTION_DIRECTORY_REQUIRED")
    need(sys.platform == "darwin" and os.getuid() != 0, "MACOS_OWNER_REQUIRED")
    need(sys.stdin.isatty() and sys.stdout.isatty() and sys.stderr.isatty(), "PRIVATE_TERMINAL_REQUIRED")
    need(not any(name in os.environ for name in ("SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE")),
         "CUSTOM_CA_ENV_DENIED")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.umask(0o077)
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    need(os.environ.get("HOME") == str(home), "HOME_MISMATCH")
    repo = home / "Desktop/avroqen"
    need(Path(__file__).absolute() == repo / "scripts/deployment-review/owner-execute-testnet.py", "SCRIPT_LOCATION")
    config = home / "Library/Application Support/near-cli/config.toml"
    binary = read_regular(CLI, owner=False, limit=100000000)
    need(sha(binary) == CLI_HASH, "CLI_HASH_MISMATCH")
    config_bytes = read_regular(config, limit=100000)
    config_validate(config_bytes)
    wasm = read_regular(repo / "docs/evidence/mandate-vault-approved.wasm")
    need(len(wasm) == WASM_SIZE and sha(wasm) == WASM_HASH, "ARCHIVE_MISMATCH")
    ref_json = unique_json(read_regular(REFERENCE))
    need(set(ref_json) == {"Transaction hash to sign", "Unsigned transaction (serialized as base64)"}, "REFERENCE_ENVELOPE")
    reference = unbase64(ref_json["Unsigned transaction (serialized as base64)"])
    decode(reference, wasm)
    need(sha(reference) == REFERENCE_HASH == ref_json["Transaction hash to sign"], "REFERENCE_HASH_MISMATCH")
    identity = check_work(empty=True)
    # Exclusive persisted marker serializes concurrent invocations. Never remove it.
    event("00-attempt-started", {"account":ACCOUNT,"network":"testnet","retry":"FORBIDDEN","authorizationRef":authorization_ref})
    env = {"HOME":str(home), "USER":pwd.getpwuid(os.getuid()).pw_name,
           "PATH":"/usr/bin:/bin:/usr/sbin:/sbin", "TMPDIR":str(WORK), "LANG":"en_US.UTF-8"}
    write_new(WORK / "verify.swift", SWIFT_VERIFY.encode())
    child(["/usr/bin/xcrun","swiftc","-parse-as-library","-module-cache-path",str(WORK/"modules"),
           str(WORK/"verify.swift"),"-o",str(WORK/"verify-signature")], env)
    verifier_hash = sha(read_regular(WORK / "verify-signature", limit=10000000))
    write_new(WORK/"approved.wasm", wasm)
    signed = WORK/"signed.json"
    def unchanged():
        need(check_work() == identity, "WORK_DIRECTORY_CHANGED")
        need(sha(read_regular(CLI, owner=False, limit=100000000)) == CLI_HASH, "CLI_CHANGED")
        need(read_regular(config, limit=100000) == config_bytes, "CONFIG_CHANGED")
        config_validate(config_bytes)
        need(read_regular(WORK/"approved.wasm", mode=0o600) == wasm, "ARCHIVE_CHANGED")
        need(sha(read_regular(WORK/"verify-signature", limit=10000000)) == verifier_hash, "VERIFIER_CHANGED")
    unchanged()
    need(sha(read_regular(WORK/"verify-signature", limit=10000000)) == verifier_hash, "VERIFIER_CHANGED")
    print("NEW authorization required: the earlier authorization already produced a signature.", flush=True)
    print("Confirm one NEW Testnet deploy/init using Testing only, approved Wasm, 100 Tgas, zero deposit.", flush=True)
    print("Fresh nonce and block will be fetched AFTER this confirmation; no replacement or retry.", flush=True)
    need(input("Type AUTHORIZE NEW ATTEMPT to confirm the separately granted new authorization: ") == "AUTHORIZE NEW ATTEMPT", "OWNER_CANCELLED")
    event("00a-owner-confirmed", {"authorizationRef":authorization_ref,"scope":"ONE_FRESH_DEPLOYMENT_ONLY"})
    unchanged()
    snapshot = preflight()
    raw = construct(wasm, snapshot["nonce"], b58decode(snapshot["header"]["hash"]))
    compare_reference(raw, reference, wasm, snapshot["nonce"], b58decode(snapshot["header"]["hash"]))
    digest = hashlib.sha256(raw).digest()
    tx_hash = b58encode(digest)
    event("01-unsigned-verified", {"hash":tx_hash,"sha256":digest.hex(),"publicKey":TESTING,
                                  "nonce":snapshot["nonce"],"block":snapshot["header"],
                                  "minimumAtomic":snapshot["minimum"],"balanceAtomic":snapshot["balance"]})
    write_new(WORK/"unsigned.json", json.dumps({"Transaction hash to sign":digest.hex(),
              "Unsigned transaction (serialized as base64)":base64.b64encode(raw).decode()}).encode())
    print("Verified fresh public transaction hash:", tx_hash, flush=True)
    unchanged()
    fresh(snapshot["header"])
    event("02-signing-started", {"hash":tx_hash,"status":"NO_RETRY_IF_INTERRUPTED"})
    child([str(CLI),"--offline","--quiet","contract","deploy",ACCOUNT,"use-file",str(WORK/"approved.wasm"),
           "with-init-call","new","json-args",ARGS.decode(),"prepaid-gas","100 Tgas","attached-deposit","0 yoctoNEAR",
           "network-config","testnet","sign-with-keychain","--signer-public-key",TESTING,
           "--nonce",str(snapshot["nonce"]),"--block-hash",snapshot["header"]["hash"],
           "--block-height",str(snapshot["header"]["height"]),"save-to-file",str(signed)],env)
    signed_bytes = read_regular(signed, mode=0o600)
    signature = verify_signed(signed_bytes, raw)
    need(sha(read_regular(WORK/"verify-signature", limit=10000000)) == verifier_hash, "VERIFIER_CHANGED")
    child([str(WORK/"verify-signature")],env,b58decode(TESTING[8:])+digest+signature,timeout=20)
    event("03-signature-verified", {"hash":tx_hash,"status":"SIGNED_NOT_SUBMITTED"})
    # Repeat every live preflight, same current nonce, canonical saved block and age.
    current = preflight()
    need(current["nonce"] == snapshot["nonce"], "NONCE_CHANGED_NO_RESIGN")
    saved = rpc("block", {"block_id":snapshot["header"]["height"]})["header"]
    need(saved["hash"] == snapshot["header"]["hash"] and saved["height"] == snapshot["header"]["height"]
         and current["header"]["height"] >= saved["height"], "SAVED_BLOCK_NOT_CANONICAL")
    need(current["validity"] == snapshot["validity"]
         and current["header"]["height"] - saved["height"] < current["validity"], "BLOCK_EXPIRED")
    fresh(snapshot["header"])
    unchanged()
    need(read_regular(signed, mode=0o600) == signed_bytes, "SIGNED_FILE_CHANGED")
    # Persist intent BEFORE send: a crash here must be treated as potentially submitted.
    event("04-submission-attempted", {"hash":tx_hash,"status":"UNKNOWN_UNTIL_RECEIPTS_VERIFIED"})
    fresh(snapshot["header"])
    child([str(CLI),"--quiet","transaction","send-signed-transaction","file-with-base64-signed-transaction",
           str(signed),"network-config","testnet","send"],env,timeout=180)
    event("05-cli-returned", {"hash":tx_hash,"status":"CLI_RETURNED_ZERO_RECEIPT_REVIEW_REQUIRED"})
    print("CLI returned. Do not rerun. Verify finalized receipts, code and accounting for",tx_hash,flush=True)
    print("Protected evidence retained; signed.json must not be shared. Financial operations remain disabled.")


def main():
    global WORK
    try:
        WORK, authorization_ref = configure_attempt(sys.argv[1:])
        execute(authorization_ref)
    except BaseException as error:
        # Do not render subprocess, RPC, parsing or credential output or tracebacks.
        code = str(error) if isinstance(error, Stop) else "STOP_UNEXPECTED_OR_INTERRUPTED"
        print(code + ". STOP; do not rerun or clear evidence. Investigate public receipts if signing/submission started.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
