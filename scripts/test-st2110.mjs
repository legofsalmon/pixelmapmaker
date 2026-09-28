/**
 * ST 2110 flows, links, addresses and SDP files, checked against the sender
 * they are meant to describe and against the standards' own figures.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-st2110.mjs
 */
import { register } from 'node:module';
import zlib from 'node:zlib';

register('./loader.mjs', import.meta.url);

const {
  DEFAULT_ST2110,
  bitsPerPixel,
  exactFrameRate,
  findFrameRate,
  flowRate,
  formatIpv4,
  groupsFrom,
  linksFor,
  normaliseSt2110,
  packJpegXs,
  packUncompressed,
  paddedWidth,
  parseClock,
  parseIpv4,
  pixelGroup,
  planSt2110,
  sdpFileName,
  sdpForFlow,
  sharesControlMac,
} = await import('../src/lib/st2110.ts');
const { crc32, zip } = await import('../src/lib/zip.ts');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const same = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `(got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);

const near = (name, actual, expected, tolerance) =>
  check(name, Math.abs(actual - expected) <= tolerance, `(got ${actual}, wanted ${expected} ±${tolerance})`);

/** A screen built by hand, so a change to the cabinet library cannot move a test. */
function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'main',
    name: 'Main wall',
    cols: 12,
    rows: 6,
    spec: { resolution: { w: 192, h: 192 }, ...specOverrides },
    ...rest,
  };
}

const settings = (overrides = {}) => ({ ...DEFAULT_ST2110, transport: 'uncompressed', ...overrides });

console.log('\nPixel groups, as ST 2110-20 Tables 1 and 2 give them');
{
  same('4:2:2 8-bit: 4 octets for 2 pixels', pixelGroup('YCbCr-4:2:2', 8), { octets: 4, pixels: 2 });
  same('4:2:2 10-bit: 5 octets for 2 pixels', pixelGroup('YCbCr-4:2:2', 10), { octets: 5, pixels: 2 });
  same('4:2:2 12-bit: 6 octets for 2 pixels', pixelGroup('YCbCr-4:2:2', 12), { octets: 6, pixels: 2 });
  same('RGB 8-bit: 3 octets for 1 pixel', pixelGroup('RGB', 8), { octets: 3, pixels: 1 });
  same('RGB 10-bit: 15 octets for 4 pixels', pixelGroup('RGB', 10), { octets: 15, pixels: 4 });
  same('4:4:4 12-bit: 9 octets for 2 pixels', pixelGroup('YCbCr-4:4:4', 12), { octets: 9, pixels: 2 });
  for (const sampling of ['RGB', 'YCbCr-4:4:4', 'YCbCr-4:2:2']) {
    for (const depth of [8, 10, 12]) {
      const g = pixelGroup(sampling, depth);
      check(
        `${sampling} ${depth}-bit: a group is exactly its pixels' bits`,
        g.octets * 8 === g.pixels * bitsPerPixel(sampling, depth)
      );
    }
  }
  check('a width is padded up to whole groups', paddedWidth(150, pixelGroup('RGB', 10)) === 152);
  check('and left alone when it already is one', paddedWidth(2304, pixelGroup('RGB', 10)) === 2304);
}

console.log('\nPackets, against captures of the st2110 sender');
{
  /*
   * Every row here is a capture: `st2110 send video FORMAT --sampling S
   * --depth D --pcap` from github.com/legofsalmon/st2110 at 7d628c6, read
   * back by `st2110 pcap`, which counts each flow's packets a frame and its
   * octets at the IP layer. Planning figures that disagreed with the sender
   * would put a different number on the spec sheet from the one a capture
   * of the real stream shows.
   */
  const captured = [
    [1920, 1080, 'YCbCr-4:2:2', 10, 4320, 5_391_360],
    [1280, 720, 'YCbCr-4:2:2', 10, 2160, 2_407_680],
    [160, 90, 'YCbCr-4:2:2', 10, 30, 37_800],
    [2304, 1152, 'RGB', 10, 8064, 10_340_352],
    [2112, 1056, 'RGB', 8, 5280, 6_944_256],
    [2112, 1056, 'RGB', 12, 7392, 10_391_040],
    [3840, 2160, 'YCbCr-4:2:2', 10, 15120, 21_461_760],
    [1000, 500, 'YCbCr-4:4:4', 12, 2000, 2_346_000],
    [400, 100, 'RGB', 8, 100, 124_800],
    [480, 270, 'RGB', 8, 540, 414_720],
  ];
  for (const [w, h, sampling, depth, packets, ipOctets] of captured) {
    const p = packUncompressed(w, h, pixelGroup(sampling, depth));
    same(`${w}x${h} ${sampling} ${depth}-bit: ${packets} packets, ${ipOctets} octets a frame`, [p.packets, p.ipOctets], [
      packets,
      ipOctets,
    ]);
  }

  const p = packUncompressed(160, 90, pixelGroup('YCbCr-4:2:2', 10));
  check('rows of 400 octets go three to a packet', p.packets === 90 / 3);
  const edge = packUncompressed(480, 270, pixelGroup('RGB', 8));
  check('a row 9 octets over the limit takes two packets', edge.packets === 270 * 2);
  check(
    'the wire adds 38 octets a packet: header, FCS, preamble and gap',
    edge.wireOctets - edge.ipOctets === edge.packets * 38
  );

  // The analyser's rate for the 2304x1152p50 RGB 10-bit capture: 4136.1 Mb/s.
  const r = flowRate(2304, 1152, settings({ sampling: 'RGB', depth: 10, frameRate: '50' }));
  near('2304x1152p50 RGB 10-bit is 4136.1 Mb/s at the IP layer, as captured', r.ipBps / 1e6, 4136.1, 0.05);
  near('and 3.98 Gb/s of pixels, as the linter reads its SDP file', r.dataBps / 1e9, 3.98, 0.005);
  check('403,200 packets a second', r.packetsPerSecond === 8064 * 50);
}

console.log('\nFrame rates');
{
  same('59.94 is written 60000/1001', exactFrameRate(findFrameRate('59.94')), '60000/1001');
  same('23.98 is written 24000/1001', exactFrameRate(findFrameRate('23.98')), '24000/1001');
  same('50 is written 50', exactFrameRate(findFrameRate('50')), '50');
  const a = flowRate(1920, 1080, settings({ sampling: 'YCbCr-4:2:2', frameRate: '60' }));
  const b = flowRate(1920, 1080, settings({ sampling: 'YCbCr-4:2:2', frameRate: '59.94' }));
  near('59.94 costs 1000/1001 of 60', b.wireBps / a.wireBps, 1000 / 1001, 1e-12);
  // Review figure for 2160p60 4:2:2 10-bit: about 10.7 Gb/s with framing.
  const uhd = flowRate(3840, 2160, settings({ sampling: 'YCbCr-4:2:2', frameRate: '60' }));
  near('2160p60 4:2:2 10-bit is about 10.6 Gb/s on the wire', uhd.wireBps / 1e9, 10.58, 0.01);
  check('which is too much for a 10 GbE link', uhd.wireBps > 10e9);
}

console.log('\nJPEG XS');
{
  // 1080p 4:2:2 10-bit is 20 bits a pixel; at 10:1 it is 2.
  const p = packJpegXs(1920, 1080, 2);
  check('2 bits a pixel is 518,400 octets a frame', p.dataOctets === 518_400);
  check('in packets of 1432 octets, a whole number of 8', p.packets === Math.ceil(518_400 / 1432));
  check('each carrying 44 octets of RTP, payload, UDP and IP header', p.ipOctets === 518_400 + p.packets * 44);
  const x = flowRate(1920, 1080, settings({ transport: 'jpeg-xs', sampling: 'YCbCr-4:2:2', xsRatio: 10, frameRate: '60' }));
  const u = flowRate(1920, 1080, settings({ sampling: 'YCbCr-4:2:2', frameRate: '60' }));
  near('10:1 takes about a tenth of the link', x.wireBps / u.wireBps, 0.1, 0.005);
  check('and pads nothing: JPEG XS has no pixel groups', flowRate(150, 100, settings({ transport: 'jpeg-xs' })).padding === 0);
}

console.log('\nLinks');
{
  check('four 6 Gb/s flows fit two 25 GbE links at 90%', linksFor([6e9, 6e9, 6e9, 6e9], 22.5e9) === 2);
  check('largest first: 15, 10, 10, 7 and 5 take three', linksFor([5e9, 10e9, 15e9, 7e9, 10e9], 22.5e9) === 3);
  check('nothing takes no links', linksFor([], 22.5e9) === 0);
  check('a flow bigger than a link still takes one', linksFor([30e9], 22.5e9) === 1);
  check('and leaves the rest to share', linksFor([30e9, 10e9, 10e9], 22.5e9) === 2);
  // First fit puts the two 9s together, and the four 6.75s then need two more.
  check(
    'two 9 and four 6.75 Gb/s flows take two links, where first fit takes three',
    linksFor([9e9, 9e9, 6.75e9, 6.75e9, 6.75e9, 6.75e9], 22.5e9) === 2
  );
  // Three of them overfill a link, so 40 take 20: the floor settles it with no search.
  let started = performance.now();
  check('forty flows of 34% take twenty links', linksFor(Array(40).fill(0.34 * 22.5e9), 22.5e9) === 20);
  check('at once', performance.now() - started < 50, `${(performance.now() - started).toFixed(1)} ms`);

  // Sixty flows of four sizes, the kind of plan where the search could run long.
  let seed = 7;
  const next = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  let slowest = 0;
  let overFirstFit = 0;
  for (let t = 0; t < 50; t++) {
    const sizes = [0, 1, 2, 3].map(() => (0.08 + next() * 0.9) * 22.5e9);
    const rates = Array.from({ length: 60 }, () => sizes[Math.floor(next() * 4)]);
    const firstFit = [];
    for (const r of [...rates].sort((a, b) => b - a)) {
      const i = firstFit.findIndex((used) => used + r <= 22.5e9);
      if (i >= 0) firstFit[i] += r;
      else firstFit.push(r);
    }
    started = performance.now();
    if (linksFor(rates, 22.5e9) > firstFit.length) overFirstFit += 1;
    slowest = Math.max(slowest, performance.now() - started);
  }
  check('never more than first fit', overFirstFit === 0);
  check('and never slow, even at sixty flows', slowest < 250, `${slowest.toFixed(1)} ms`);
}

console.log('\nScreens cut into flows');
{
  // 20 x 4 cabinets of 192 px: 3840 x 768. RGB 12-bit at 120 fps is 12.7 Gb/s of pixels.
  const wide = layer({ cols: 20, rows: 4 });
  const s = settings({ sampling: 'RGB', depth: 12, frameRate: '120', linkGbps: 10, linkLoad: 0.9 });
  const plan = planSt2110([wide], { width: 3840, height: 2160 }, s);
  same('a screen over a 10 GbE link goes as two flows', plan.flows.map((f) => f.cols), [
    [0, 10],
    [10, 20],
  ]);
  check('each fits', plan.flows.every((f) => f.wireBps <= 9e9));
  same('named by part', plan.flows.map((f) => f.label), ['Main wall, part 1 of 2', 'Main wall, part 2 of 2']);
  check('and the plan says where it was cut', plan.warnings.some((w) => w.includes('cut after cabinet column 10')));

  const odd = planSt2110([layer({ cols: 21, rows: 4 })], { width: 0, height: 0 }, s);
  same('21 columns cut 11 and 10', odd.flows.map((f) => f.cols[1] - f.cols[0]), [11, 10]);

  const tall = planSt2110([layer({ cols: 3, rows: 30 })], { width: 0, height: 0 }, s);
  check('a tall screen is cut between rows', tall.flows.length > 1 && tall.flows.every((f) => f.cols[1] === 3));

  const huge = planSt2110([layer({ cols: 2, rows: 1, spec: { resolution: { w: 4000, h: 4000 } } })], { width: 0, height: 0 }, s);
  check('one cabinet too big for any cut stays whole', huge.flows.length === 1 && huge.flows[0].tooBig);
  check('and says to choose a faster link', huge.warnings.some((w) => w.includes('Choose a faster link')));

  const fits = planSt2110([wide], { width: 0, height: 0 }, { ...s, linkGbps: 25 });
  check('the same screen fits one 25 GbE link whole', fits.flows.length === 1 && !fits.flows[0].tooBig);

  const narrow = planSt2110([layer({ cols: 1, rows: 1, spec: { resolution: { w: 150, h: 150 } } })], { width: 0, height: 0 }, settings({ sampling: 'RGB', depth: 10 }));
  check('a width that is not whole groups is padded', narrow.flows[0].width === 152 && narrow.flows[0].padding === 2);
  check('and the plan says so', narrow.warnings.some((w) => w.includes('2 unused on the right')));
}

console.log('\nThe plan');
{
  const screens = [layer(), layer({ id: 'side', name: 'Side', cols: 4, rows: 6 })];
  const s = settings({ sampling: 'RGB', depth: 10, frameRate: '50', redundancy: true });
  const plan = planSt2110(screens, { width: 3840, height: 2160 }, s);
  same('one flow a screen', plan.flows.map((f) => [f.label, f.width, f.height]), [
    ['Main wall', 2304, 1152],
    ['Side', 768, 1152],
  ]);
  same('primary groups count up from the base', plan.flows.map((f) => f.primary), ['239.20.1.1', '239.20.1.2']);
  same('secondary groups in step', plan.flows.map((f) => f.secondary), ['239.21.1.1', '239.21.1.2']);
  check('two networks', plan.networks === 2);
  near('bandwidth is the flows added up', plan.wireBps, plan.flows[0].wireBps + plan.flows[1].wireBps, 1);
  check('one 25 GbE link carries both', plan.links === 1);
  check('the largest flow is the main wall', plan.largest?.label === 'Main wall');
  check('the whole canvas as one flow costs more than the screens', plan.canvasWireBps > plan.wireBps);
  same('nothing to warn about', plan.warnings, []);

  const single = planSt2110(screens, { width: 0, height: 0 }, { ...s, redundancy: false });
  check('without ST 2022-7 there is one network and no secondary groups', single.networks === 1 && single.flows.every((f) => f.secondary === null));
}

console.log('\nAddresses');
{
  check('239.20.1.1 reads', parseIpv4('239.20.1.1') === 0xef140101);
  check('and writes back', formatIpv4(0xef140101) === '239.20.1.1');
  check('256 is not an octet', parseIpv4('239.256.1.1') === null);
  check('three octets are not an address', parseIpv4('239.20.1') === null);
  same('groups skip .255 and .0', groupsFrom(parseIpv4('239.20.1.254'), 3).map(formatIpv4), [
    '239.20.1.254',
    '239.20.2.1',
    '239.20.2.2',
  ]);
  check('and stop at the top of the range', groupsFrom(parseIpv4('239.255.255.253'), 3) === null);
  check('a unicast base gives none', groupsFrom(parseIpv4('10.0.0.1'), 1) === null);

  check('239.0.0.5 shares 224.0.0.5\'s Ethernet address', sharesControlMac(parseIpv4('239.0.0.5')));
  check('239.128.1.129 shares PTP\'s', sharesControlMac(parseIpv4('239.128.1.129')));
  check('239.20.1.1 shares nothing', !sharesControlMac(parseIpv4('239.20.1.1')));
  const flooded = planSt2110([layer()], { width: 0, height: 0 }, settings({ primaryBase: '239.0.1.100' }));
  check(
    'a plan on such a group says so',
    flooded.warnings.some((w) => w.startsWith('239.0.1.100 shares an Ethernet address with a control group, 224.0.1.100,'))
  );
  const two = planSt2110([layer(), layer({ id: 'b' })], { width: 0, height: 0 }, settings({ primaryBase: '239.0.1.100' }));
  check(
    'and on several',
    two.warnings.some((w) => w.startsWith('239.0.1.100 and 1 more share Ethernet addresses with control groups'))
  );

  const bad = planSt2110([layer()], { width: 0, height: 0 }, settings({ primaryBase: '10.1.1.1' }));
  check('a base that is not multicast leaves the flows without groups', bad.flows[0].primary === null);
  check('and says why', bad.warnings.some((w) => w.includes('10.1.1.1 is not a multicast address')));

  same('traceable is a clock', parseClock('traceable'), 'traceable');
  same('so is a grandmaster and domain', parseClock('08-00-11-ff-fe-21-e4-9b:127'), '08-00-11-FF-FE-21-E4-9B:127');
  check('a domain over 127 is not', parseClock('08-00-11-FF-FE-21-E4-9B:128') === null);
  check('nor a grandmaster written with colons', parseClock('08:00:11:FF:FE:21:E4:9B:127') === null);

  const typo = settings({ clock: 'tracable', primarySource: '239.1.1.1' });
  const typoPlan = planSt2110([layer()], { width: 0, height: 0 }, typo);
  check('a clock that is neither is warned about', typoPlan.warnings.some((w) => w.startsWith('tracable is not')));
  check('and so is a multicast sender', typoPlan.warnings.some((w) => w.startsWith('239.1.1.1 is not an address')));
  const xsPlan = planSt2110([layer()], { width: 0, height: 0 }, { ...typo, transport: 'jpeg-xs' });
  check('neither for JPEG XS, which gets no SDP files to put them in', xsPlan.warnings.length === 0, xsPlan.warnings.join(' | '));
}

console.log('\nSettings read back from a file');
{
  same('nothing reads as the defaults', normaliseSt2110(undefined), DEFAULT_ST2110);
  const edited = normaliseSt2110({
    transport: 'uncompressed',
    depth: 9,
    clock: 127,
    linkGbps: '25',
    port: 70000,
    redundancy: 'yes',
    frameRate: '59.94',
    primaryBase: '239.30.1.1',
  });
  same(
    'what the tab could have set is kept, and the rest is its default',
    [edited.transport, edited.depth, edited.clock, edited.linkGbps, edited.port, edited.redundancy, edited.frameRate, edited.primaryBase],
    ['uncompressed', 10, 'traceable', 25, 5004, false, '59.94', '239.30.1.1']
  );
  let threw = null;
  try {
    planSt2110([layer()], { width: 3840, height: 2160 }, normaliseSt2110({ transport: 'uncompressed', depth: 9, clock: 5 }));
  } catch (err) {
    threw = err;
  }
  check('so a hand-edited file plans rather than throws', threw === null, String(threw));
}

console.log('\nSDP files');
{
  /*
   * Checked with st2110 (github.com/legofsalmon/st2110). `st2110 lint` finds
   * no errors or warnings, only the note that TSMODE is absent, which
   * ST 2110-10 allows. A matching stream written by `st2110 send --pcap`, read
   * against this file by `st2110 receive`, lost none of its 80,640 packets,
   * and `st2110 pcap` found both legs fit 2110TPN.
   */
  const expected = [
    'v=0',
    'o=- 3627061578 3086111066 IN IP4 10.20.1.10',
    's=Main wall',
    't=0 0',
    'a=group:DUP primary secondary',
    'm=video 5004 RTP/AVP 96',
    'c=IN IP4 239.20.1.1/32',
    'a=source-filter: incl IN IP4 239.20.1.1 10.20.1.10',
    'a=rtpmap:96 raw/90000',
    'a=fmtp:96 sampling=RGB; width=2304; height=1152; exactframerate=50; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017; TP=2110TPN;',
    'a=ts-refclk:ptp=IEEE1588-2008:traceable',
    'a=mediaclk:direct=0',
    'a=mid:primary',
    'm=video 5004 RTP/AVP 96',
    'c=IN IP4 239.21.1.1/32',
    'a=source-filter: incl IN IP4 239.21.1.1 10.21.1.10',
    'a=rtpmap:96 raw/90000',
    'a=fmtp:96 sampling=RGB; width=2304; height=1152; exactframerate=50; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017; TP=2110TPN;',
    'a=ts-refclk:ptp=IEEE1588-2008:traceable',
    'a=mediaclk:direct=0',
    'a=mid:secondary',
  ];
  const s = settings({
    sampling: 'RGB',
    depth: 10,
    frameRate: '50',
    redundancy: true,
    primarySource: '10.20.1.10',
    secondarySource: '10.21.1.10',
  });
  const plan = planSt2110([layer()], { width: 0, height: 0 }, s);
  const sdp = sdpForFlow(plan.flows[0], s);
  same('a 2022-7 pair with its senders', sdp?.split('\r\n'), [...expected, '']);
  check('every line ends CRLF', sdp && !/[^\r]\n/.test(sdp));

  const bare = sdpForFlow(plan.flows[0], { ...s, redundancy: false, primarySource: '' });
  check('one leg and no sender: no group, no source filter, no mid', bare && !/group|source-filter|mid/.test(bare));
  check('and an origin of 0.0.0.0', bare?.includes('IN IP4 0.0.0.0\r\n'));

  const gm = sdpForFlow(plan.flows[0], { ...s, clock: '08-00-11-ff-fe-21-e4-9b:127' });
  check('a grandmaster is named as the clock', gm?.includes('a=ts-refclk:ptp=IEEE1588-2008:08-00-11-FF-FE-21-E4-9B:127\r\n'));
  check('JPEG XS gets no SDP file', sdpForFlow(plan.flows[0], { ...s, transport: 'jpeg-xs' }) === null);
  const again = sdpForFlow(planSt2110([layer()], { width: 0, height: 0 }, s).flows[0], s);
  check('the same plan writes the same file', again === sdp);
  same('file names number and name the flow', sdpFileName({ label: 'Main wall, part 2 of 3' }, 1), '02-main-wall-part-2-of-3.sdp');
  same('a name with nothing usable in it', sdpFileName({ label: '???' }, 9), '10-screen.sdp');
}

console.log('\nZip');
{
  const text = new TextEncoder().encode('v=0\r\n');
  check('CRC-32 matches zlib', crc32(text) === zlib.crc32(text));
  const files = [
    { name: '01-main-wall.sdp', text: 'v=0\r\n' },
    { name: '02-side.sdp', text: 'v=0\r\ns=Side\r\n' },
  ];
  const archive = zip(files, new Date(2026, 8, 28, 12, 30, 0));
  const view = new DataView(archive.buffer);
  check('starts with a local file header', view.getUint32(0, true) === 0x04034b50);
  const end = archive.length - 22;
  check('ends with the end of central directory', view.getUint32(end, true) === 0x06054b50);
  check('which counts both files', view.getUint16(end + 10, true) === 2);

  // Walk the central directory the way an unzipper does, and read each file back.
  let at = view.getUint32(end + 16, true);
  const read = [];
  for (let i = 0; i < 2; i++) {
    check(`entry ${i + 1} has a central header`, view.getUint32(at, true) === 0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = archive.subarray(start, start + size);
    check(`${name}: stored, with its CRC`, view.getUint16(local + 8, true) === 0 && zlib.crc32(data) === crc);
    read.push([name, new TextDecoder().decode(data)]);
    at += 46 + nameLength;
  }
  same('both files come back as they went in', read, files.map((f) => [f.name, f.text]));
  // 12:30 on 28 September 2026, in MS-DOS form.
  check('stamped with the date given', view.getUint16(12, true) === ((46 << 9) | (9 << 5) | 28) && view.getUint16(10, true) === (12 << 11) | (30 << 5));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
