"""Fixtures/mocks ONLY. Never invoke the executor main or any real near command."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('owner_deploy', ROOT/'scripts/deployment-review/owner-execute-testnet.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)  # Definitions only; __main__ guard is never entered.
WASM = (ROOT/'docs/evidence/mandate-vault-approved.wasm').read_bytes()
CONFIG = b'''version = "5"
credentials_home_dir = "/dev/null/avroqen-no-legacy"
[network_connection.testnet]
network_name = "testnet"
rpc_url = "https://rpc.testnet.near.org"
wallet_url = "https://testnet.mynearwallet.com/"
explorer_transaction_url = "https://explorer.testnet.near.org/transactions/"
'''
BLOCK = bytes(range(32))
RAW = m.construct(WASM, 42, BLOCK)


def envelope(raw=RAW):
    return json.dumps({'signed_transaction_as_base64':base64.b64encode(raw+b'\0'+b'x'*64).decode()}).encode()


def snapshot():
    return {'header':{'hash':m.b58encode(BLOCK), 'height':100,
                      'timestamp_nanosec':str(time.time_ns())},
            'nonce':42, 'minimum':'4003500000000000000000000',
            'balance':'4500000000000000000000000','validity':86400}


class DecodeTests(unittest.TestCase):
    def test_roundtrip_and_parsed_refresh(self):
        old = m.construct(WASM, 3, b'\x03'*32)
        nonce, block, spans = m.decode(RAW, WASM)
        self.assertEqual((nonce,block),(42,BLOCK))
        self.assertEqual(RAW[slice(*spans['nonce'])], (42).to_bytes(8,'little'))
        self.assertEqual(m.compare_reference(RAW,old,WASM,42,BLOCK),(3,b'\x03'*32))

    def test_mutations_fail(self):
        # Includes field lengths (old fixed-offset bug), key, nonce expectations,
        # account substitutions, action tags, Wasm, method/args, gas and deposit.
        bads = [RAW+b'\0', RAW[:-1], b'\1'+RAW, RAW[:4]+b'X'+RAW[5:],
                RAW[:24]+b'\1'+RAW[25:], RAW[:-24]+(1).to_bytes(8,'little')+RAW[-16:],
                RAW[:-16]+(1).to_bytes(16,'little'), RAW.replace(b'new',b'NEW'),
                RAW.replace(m.ARGS,b'{"network":"mainnet"}'),
                RAW.replace(WASM[:64],b'x'*64,1)]
        for bad in bads:
            with self.subTest(size=len(bad)),self.assertRaises(Exception):m.decode(bad,WASM)
        with self.assertRaises(m.Stop):m.compare_reference(RAW,RAW,WASM,43,BLOCK)
        with self.assertRaises(m.Stop):m.compare_reference(RAW,RAW,WASM,42,b'\3'*32)

    def test_signed_frame_exact(self):
        self.assertEqual(m.verify_signed(envelope(),RAW),b'x'*64)
        for raw in [RAW+b'x',RAW[:-1],RAW.replace(m.ARGS,b'{"network":"mainnet"}')]:
            with self.assertRaises(m.Stop):m.verify_signed(envelope(raw),RAW)
        with self.assertRaises(m.Stop):m.verify_signed(b'{"signed_transaction_as_base64":"AA==","extra":1}',RAW)
        with self.assertRaises(m.Stop):m.unique_json(b'{"x":1,"x":2}')
        with self.assertRaises(Exception):m.unbase64('AAA=\n')

    def test_config_strict(self):
        m.config_validate(CONFIG)
        for bad in [CONFIG.replace(b'/dev/null/avroqen-no-legacy',b'/tmp/empty'),
                    CONFIG.replace(b'"5"',b'"4"'),
                    CONFIG.replace(m.RPC.encode(),b'https://evil.example'),
                    CONFIG.replace(b'network_name = "testnet"',b'network_name = "mainnet"'),
                    CONFIG+b'meta_transaction_relayer_url = "https://evil.example"\n',
                    CONFIG+b'rpc_api_key = "DISPOSABLE_SENTINEL"\n',
                    CONFIG+b'rpc_url = "https://rpc.testnet.near.org"\n',
                    CONFIG+b'invalid syntax\n',CONFIG.replace(b'"testnet"',b'"test\\net"')]:
            with self.subTest(config='sanitized'),self.assertRaises(Exception):m.config_validate(bad)


class FilesystemTests(unittest.TestCase):
    def test_protected_files_and_once_marker(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name).resolve();root.chmod(0o700)
            with patch.object(m,'WORK',root):
                m.check_work(empty=True)
                m.event('00-attempt-started',{'public':'only'})
                with self.assertRaises(m.Stop):m.check_work(empty=True)
                with self.assertRaises(FileExistsError):m.event('00-attempt-started',{})
                p=root/'file';m.write_new(p,b'fixture')
                self.assertEqual(m.read_regular(p,mode=0o600),b'fixture')
                p.chmod(0o644)
                with self.assertRaises(m.Stop):m.read_regular(p,mode=0o600)
                link=root/'link';link.symlink_to(p)
                with self.assertRaises(m.Stop):m.read_regular(link)
                hard=root/'hard';os.link(p,hard)
                with self.assertRaises(m.Stop):m.read_regular(p)
                root.chmod(0o755)
                with self.assertRaises(m.Stop):m.check_work()


class RpcTests(unittest.TestCase):
    def responses(self,fault=None):
        s=snapshot();h=s['header']
        def rpc(method,params):
            if method=='status':return {'chain_id':'mainnet' if fault=='network' else 'testnet'}
            if method=='block':
                if fault=='stale':h['timestamp_nanosec']=str(time.time_ns()-121000000000)
                return {'header':h}
            if method=='EXPERIMENTAL_protocol_config':
                return {'protocol_version':89 if fault=='protocol' else 88,'transaction_validity_period':86400,
                        'runtime_config':{'storage_amount_per_byte':'10000000000000000000'}}
            if method=='gas_price':return {'gas_price':'1' if fault=='gas' else '100000000'}
            self.assertEqual(params['account_id'],m.ACCOUNT)
            self.assertEqual(params['block_id'],h['hash'])
            result={'block_hash':'wrong' if fault=='block' else h['hash'],'block_height':100}
            if params['request_type']=='view_account':
                result.update(amount='1' if fault=='balance' else '4500000000000000000000000',locked='0',storage_usage=264,
                              code_hash='deployed' if fault=='code' else '11111111111111111111111111111111')
            elif params['request_type']=='view_access_key':
                self.assertEqual(params['public_key'],m.TESTING)
                result.update(nonce=41,permission='FullAccess')
            else:
                keys=[{'public_key':key,'access_key':{'permission':'FullAccess','nonce':41}} for key in (m.PRIMARY,m.TESTING)]
                if fault=='third':keys.append({'public_key':'other','access_key':{'permission':'FullAccess','nonce':0}})
                if fault=='missing':keys.pop()
                if fault=='duplicate':keys[1]=keys[0]
                if fault=='restricted':keys[0]['access_key']['permission']={'FunctionCall':{}}
                result['keys']=keys
            return result
        return rpc

    def test_preflight_positive(self):
        with patch.object(m,'rpc',side_effect=self.responses()):
            result=m.preflight()
        self.assertEqual(result['nonce'],42)
        self.assertEqual(result['minimum'],'4003500000000000000000000')

    def test_negative_preflight(self):
        for fault in ['network','stale','protocol','gas','block','balance','code','third','missing','duplicate','restricted']:
            with self.subTest(fault=fault),patch.object(m,'rpc',side_effect=self.responses(fault)),self.assertRaises(m.Stop):m.preflight()


class RpcTransportTests(unittest.TestCase):
    """Exercise the real parser/transport guards with a mocked HTTP opener only."""
    def invoke(self,make_reply=None,body=None,status=200,url=m.RPC):
        captured=[]
        with patch.object(m.urllib.request,'build_opener') as build:
            opener=build.return_value
            response=opener.open.return_value.__enter__.return_value
            def opened(request,timeout):
                self.assertEqual(request.full_url,m.RPC)
                self.assertEqual(request.get_method(),'POST')
                self.assertEqual(timeout,20)
                issued=json.loads(request.data)
                self.assertEqual(issued['jsonrpc'],'2.0')
                self.assertRegex(issued['id'],r'^owner-preflight-[1-9][0-9]*$')
                self.assertEqual((issued['method'],issued['params']),('status',[]))
                captured.append(issued)
                value=make_reply(issued) if make_reply else {
                    'jsonrpc':'2.0','id':issued['id'],'result':{'chain_id':'testnet'}}
                payload=body(issued) if body else json.dumps(value).encode()
                response.status=status;response.url=url
                response.read.side_effect=lambda limit:payload[:limit]
                return opener.open.return_value
            opener.open.side_effect=opened
            try:return m.rpc('status',[]),captured
            finally:
                opener.open.assert_called_once()
                handlers=build.call_args.args
                self.assertEqual(handlers[0].proxies,{})
                self.assertIsInstance(handlers[1],m.NoRedirect)

    def test_valid_envelope_correlates_with_issued_request(self):
        result,requests=self.invoke()
        self.assertEqual(result,{'chain_id':'testnet'})
        self.assertEqual(len(requests),1)

    def test_separate_requests_have_distinct_ids(self):
        _,first=self.invoke();_,second=self.invoke()
        self.assertNotEqual(first[0]['id'],second[0]['id'])
        old_id=first[0]['id']
        with self.assertRaises(m.Stop):
            self.invoke(lambda _: {'jsonrpc':'2.0','id':old_id,'result':{}})

    def test_missing_malformed_mismatched_or_ambiguous_envelopes(self):
        cases=[
            lambda q:{'id':q['id'],'result':{}},
            lambda q:{'jsonrpc':'1.0','id':q['id'],'result':{}},
            lambda q:{'jsonrpc':2.0,'id':q['id'],'result':{}},
            lambda q:{'jsonrpc':'2.0','result':{}},
            lambda q:{'jsonrpc':'2.0','id':'wrong','result':{}},
            lambda q:{'jsonrpc':'2.0','id':None,'result':{}},
            lambda q:{'jsonrpc':'2.0','id':1,'result':{}},
            lambda q:{'jsonrpc':'2.0','id':True,'result':{}},
            lambda q:{'jsonrpc':'2.0','id':q['id']},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':None},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':[]},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':'data'},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':1},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'error':{'code':-1}},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':{},'error':None},
            lambda q:{'jsonrpc':'2.0','id':q['id'],'result':{},'extra':'unreviewed'},
            lambda q:[],lambda q:None,lambda q:'response',
            lambda q:[{'jsonrpc':'2.0','id':q['id'],'result':{}}],
        ]
        for number,make_reply in enumerate(cases):
            with self.subTest(case=number),self.assertRaises(m.Stop):self.invoke(make_reply)

    def test_duplicate_json_keys_are_rejected(self):
        for template in [
            '{{"jsonrpc":"2.0","id":"{id}","id":"{id}","result":{{}}}}',
            '{{"jsonrpc":"2.0","jsonrpc":"2.0","id":"{id}","result":{{}}}}',
            '{{"jsonrpc":"2.0","id":"{id}","result":{{}},"result":{{}}}}',
            '{{"jsonrpc":"2.0","id":"{id}","result":{{"x":1,"x":2}}}}',
        ]:
            with self.subTest(template=template),self.assertRaises(m.Stop):
                self.invoke(body=lambda q:template.format(id=q['id']).encode())

    def test_malformed_and_nonfinite_json_rejected(self):
        for payload in [b'{',b'',b'\xff',b'{"jsonrpc":"2.0"} trailing']:
            with self.subTest(payload=repr(payload)),self.assertRaises((ValueError,m.Stop)):
                self.invoke(body=lambda _:payload)
        for value in ['NaN','Infinity','-Infinity']:
            with self.subTest(value=value),self.assertRaises(m.Stop):
                self.invoke(body=lambda q: ('{"jsonrpc":"2.0","id":'+json.dumps(q['id'])+
                                           ',"result":{"value":'+value+'}}').encode())

    def test_http_endpoint_and_size_guards(self):
        for kwargs in [{'status':503},{'url':'https://evil.example/'},
                       {'body':lambda _:b'x'*2000001}]:
            with self.subTest(case=list(kwargs)),self.assertRaises(m.Stop):self.invoke(**kwargs)

    def test_redirects_rejected(self):
        with self.assertRaisesRegex(m.Stop,'RPC_REDIRECT_DENIED'):
            m.NoRedirect().redirect_request(None,None,None,None,None,None)

    def test_timeout_has_one_attempt_and_no_retry(self):
        with patch.object(m.urllib.request,'build_opener') as build:
            build.return_value.open.side_effect=TimeoutError('DISPOSABLE_TIMEOUT')
            with self.assertRaises(TimeoutError):m.rpc('status',[])
            build.return_value.open.assert_called_once()

    def test_submission_and_contract_call_methods_denied_before_http(self):
        with patch.object(m.urllib.request,'build_opener') as build:
            for method,params in [('broadcast_tx_commit',[]),('send_tx',[]),
                                  ('query',{'request_type':'call_function','account_id':m.ACCOUNT}),
                                  ('query',{'request_type':'view_account','account_id':'other.testnet'})]:
                with self.subTest(method=method),self.assertRaises(m.Stop):m.rpc(method,params)
            build.assert_not_called()


class ExecutionMocks(unittest.TestCase):
    def exercise(self,fault=None):
        # Every sensitive boundary is replaced; no real subprocess, RPC, protected
        # deployment-directory access, Keychain, signing or broadcast is possible.
        home=Path('/fixture-owner');work=Path('/fixture-work')
        reference=json.dumps({'Transaction hash to sign':m.sha(RAW),'Unsigned transaction (serialized as base64)':base64.b64encode(RAW).decode()}).encode()
        files={m.CLI:b'pinned-binary',home/'Library/Application Support/near-cli/config.toml':CONFIG,
               home/'Desktop/avroqen/docs/evidence/mandate-vault-approved.wasm':WASM,m.REFERENCE:reference}
        events=[];commands=[];snap=snapshot();clock=[time.time_ns()];confirmed=[False]
        def read(path,**kwargs):return files[path]
        def write(path,data):
            if path in files:raise FileExistsError()
            files[path]=data
        def event(name,data):
            write(work/(name+".json"),json.dumps(data).encode())
            events.append((name,data))
        def child(command,env,input_data=None,timeout=180):
            commands.append(command)
            if command[0]=='/usr/bin/xcrun':files[work/'verify-signature']=b'verifier';return
            if 'sign-with-keychain' in command:
                self.assertIn('--offline',command);self.assertIn(m.TESTING,command)
                self.assertEqual(command[command.index('--nonce')+1],'42')
                if fault=='sign':raise m.Stop('SUBPROCESS_FAILED_STOP_NO_RETRY')
                if fault=='interrupt-sign':raise KeyboardInterrupt()
                if fault=='wrong-signer':
                    files[work/'signed.json']=envelope(RAW.replace(m.b58decode(m.TESTING[8:]),m.b58decode(m.PRIMARY[8:]),1));return
                files[work/'signed.json']=envelope(RAW if fault!='tampered' else RAW+b'X');return
            if command[0]==str(work/'verify-signature'):
                self.assertEqual(input_data[:32],m.b58decode(m.TESTING[8:]))
                self.assertEqual(input_data[32:64],bytes.fromhex(m.sha(RAW)))
                if fault=='signature':raise m.Stop('SUBPROCESS_FAILED_STOP_NO_RETRY')
                if fault=='expired':clock[0]+=121000000000
                return
            self.assertIn('send-signed-transaction',command)
            self.assertIn('04-submission-attempted',[x[0] for x in events])
            if fault=='send':raise subprocess_timeout()
            if fault=='interrupt-send':raise KeyboardInterrupt()
        count=[0]
        def confirm(_prompt):
            self.assertEqual(count[0],0, 'fresh state was fetched before owner confirmation')
            self.assertEqual(len(commands),1)
            self.assertEqual(commands[0][0],'/usr/bin/xcrun')
            self.assertIn(work/'approved.wasm',files)
            if fault=='slow-confirmation':clock[0]+=600000000000
            confirmed[0]=True
            return 'AUTHORIZE NEW ATTEMPT'
        def preflight():
            self.assertTrue(confirmed[0])
            count[0]+=1
            if count[0]==1:snap['header']['timestamp_nanosec']=str(clock[0])
            s=json.loads(json.dumps(snap))
            s['header']['timestamp_nanosec']=str(clock[0])
            if count[0]==2 and fault=='nonce':s['nonce']=43
            if count[0]==2 and fault=='chain-changed':raise m.Stop('ALREADY_DEPLOYED_OR_STAKED')
            return s
        from contextlib import ExitStack
        with ExitStack() as stack:
            for target,value in [('WORK',work),('__file__',str(home/'Desktop/avroqen/scripts/deployment-review/owner-execute-testnet.py')),
                                 ('CLI_HASH',m.sha(b'pinned-binary')),('REFERENCE_HASH',m.sha(RAW))]:stack.enter_context(patch.object(m,target,value))
            stack.enter_context(patch.object(m.sys,'platform','darwin'))
            stack.enter_context(patch.object(m.os,'getuid',return_value=501))
            stack.enter_context(patch.object(m.os,'umask'))
            stack.enter_context(patch.object(m.resource,'setrlimit'))
            stack.enter_context(patch.object(m.pwd,'getpwuid',return_value=type('P',(),{'pw_dir':str(home),'pw_name':'fixture'})()))
            stack.enter_context(patch.dict(m.os.environ,{'HOME':str(home)},clear=True))
            for stream in [m.sys.stdin,m.sys.stdout,m.sys.stderr]:stack.enter_context(patch.object(stream,'isatty',return_value=True))
            for target,fn in [('read_regular',read),('write_new',write),('event',event),('child',child),('preflight',preflight)]:stack.enter_context(patch.object(m,target,side_effect=fn))
            stack.enter_context(patch.object(m,'check_work',return_value=(1,1)))
            stack.enter_context(patch.object(m,'rpc',return_value={'header':snap['header']}))
            stack.enter_context(patch('builtins.input',side_effect=confirm))
            stack.enter_context(patch.object(m.time,'time_ns',side_effect=lambda:clock[0]))
            stack.enter_context(patch('builtins.print'))
            if fault and fault != 'slow-confirmation':
                expected = KeyboardInterrupt if fault.startswith('interrupt-') else m.subprocess.TimeoutExpired if fault == 'send' else m.Stop
                with self.assertRaises(expected):m.execute('new-owner-approval-fixture')
            else:m.execute('new-owner-approval-fixture')
            calls_before=len(commands)
            with self.assertRaises(FileExistsError):m.execute('new-owner-approval-fixture')
            self.assertEqual(len(commands),calls_before,'rerun performed another subprocess')
        signs=[c for c in commands if 'sign-with-keychain' in c]
        sends=[c for c in commands if 'send-signed-transaction' in c]
        self.assertEqual(len(signs),1)
        self.assertEqual(len(sends),1 if fault in (None,'slow-confirmation','send','interrupt-send') else 0)
        if fault and fault != 'slow-confirmation':self.assertNotIn('05-cli-returned',[e[0] for e in events])
        if fault in ('send','interrupt-send'):
            self.assertIn('04-submission-attempted',[e[0] for e in events])
        if fault=='interrupt-sign':
            self.assertIn('02-signing-started',[e[0] for e in events])
            self.assertNotIn('03-signature-verified',[e[0] for e in events])
        if fault=='expired':
            self.assertIn('03-signature-verified',[e[0] for e in events])
            self.assertNotIn('04-submission-attempted',[e[0] for e in events])
        return commands

    def test_one_distinct_transaction_mock_only(self):self.exercise()
    def test_failures_never_resign_or_resubmit(self):
        for fault in ['sign','tampered','signature','nonce','expired','send','interrupt-sign','interrupt-send','wrong-signer','chain-changed']:
            with self.subTest(fault=fault):self.exercise(fault)

    def test_slow_confirmation_fetches_fresh_state_after_wait(self):self.exercise('slow-confirmation')

    def test_new_directory_and_authorization_required_without_filesystem_access(self):
        with patch.object(m.Path,'lstat',side_effect=AssertionError('No directory access allowed')):
            for path in [str(m.RETIRED_WORK),'/tmp/avroqen-deploy.MK0sOA','/private/tmp/avroqen-deploy.NEW123/../avroqen-deploy.MK0sOA']:
                with self.assertRaises(m.Stop):m.configure_attempt(['--execute-once','--work-dir',path,'--authorization-ref','owner-new-approval'])
            with self.assertRaises(m.Stop):m.configure_attempt(['--execute-once'])
            selected,ref=m.configure_attempt(['--execute-once','--work-dir','/private/tmp/avroqen-deploy.FIXTURE123','--authorization-ref','owner-new-approval'])
            self.assertEqual(ref,'owner-new-approval')
            self.assertNotEqual(selected,m.RETIRED_WORK)

    def test_inherited_custom_ca_environment_isolated_in_mock_workflow(self):
        inherited={name:'DISPOSABLE_INHERITED_CA' for name in
                   ('SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','CURL_CA_BUNDLE')}
        with patch.dict(m.os.environ,inherited,clear=True):
            self.exercise()
            self.assertEqual(dict(m.os.environ),inherited,'fixture did not restore inherited environment')

    def test_custom_ca_stops_before_any_file_or_credential_access(self):
        from contextlib import ExitStack
        for name in ('SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','CURL_CA_BUNDLE'):
            for value in ('DISPOSABLE_TEST_ONLY',''):
                with self.subTest(variable=name,present_but_empty=not value),ExitStack() as stack:
                    stack.enter_context(patch.object(m.sys,'platform','darwin'))
                    stack.enter_context(patch.object(m,'WORK',Path('/fixture-work')))
                    stack.enter_context(patch.object(m.os,'getuid',return_value=501))
                    for stream in [m.sys.stdin,m.sys.stdout,m.sys.stderr]:
                        stack.enter_context(patch.object(stream,'isatty',return_value=True))
                    stack.enter_context(patch.dict(m.os.environ,{name:value},clear=True))
                    blocked=[stack.enter_context(patch.object(m,target)) for target in
                             ('read_regular','child','rpc','preflight','check_work','write_new','event')]
                    with self.assertRaisesRegex(m.Stop,'CUSTOM_CA_ENV_DENIED'):
                        m.execute('new-owner-approval-fixture')
                    for boundary in blocked:boundary.assert_not_called()

    def test_child_discards_output_and_does_not_shell(self):
        fake=type('Result',(),{'returncode':0})()
        with patch.object(m.subprocess,'run',return_value=fake) as run:
            m.child(['MOCK_COMMAND'],{})
        options=run.call_args.kwargs
        self.assertEqual(options['stdout'],m.subprocess.DEVNULL)
        self.assertEqual(options['stderr'],m.subprocess.DEVNULL)
        self.assertEqual(options['stdin'],m.subprocess.DEVNULL)
        self.assertNotIn('shell',options)


class CryptoKitVerification(unittest.TestCase):
    @unittest.skipUnless(m.sys.platform == 'darwin', 'macOS CryptoKit verification fixture')
    def test_public_vector_and_tampered_signature_or_digest(self):
        # Published public verification vector only: no key generation or signing.
        v=json.loads((Path(__file__).parent/'ed25519-verification-fixture.json').read_text())
        payload=bytes.fromhex(v['publicKeyHex']+v['digestHex']+v['signatureHex'])
        self.assertEqual(len(payload),128)
        with tempfile.TemporaryDirectory() as name:
            root=Path(name).resolve()
            (root/'verify.swift').write_text(m.SWIFT_VERIFY)
            result=m.subprocess.run(['/usr/bin/xcrun','swiftc','-parse-as-library','-module-cache-path',str(root/'modules'),str(root/'verify.swift'),'-o',str(root/'verify')],stdout=m.subprocess.DEVNULL,stderr=m.subprocess.DEVNULL)
            self.assertEqual(result.returncode,0,'public verifier compilation failed')
            for data, expected in [(payload,0),(payload[:-1]+bytes([payload[-1]^1]),1),
                                    (payload[:32]+bytes([payload[32]^1])+payload[33:],1),(payload[:-1],1)]:
                result=m.subprocess.run([str(root/'verify')],input=data,stdout=m.subprocess.DEVNULL,stderr=m.subprocess.DEVNULL)
                self.assertEqual(result.returncode,expected)


def subprocess_timeout():
    return m.subprocess.TimeoutExpired(['MOCK_ONLY'],1)


if __name__=='__main__':unittest.main()
