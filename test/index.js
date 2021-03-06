//  Unit Test
/* global describe:true, it:true, beforeEach:true, afterEach:true */
/* eslint-disable camelcase */
process.env.AWS_LAMBDA_FUNCTION_NAME = 'unittest';
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const uuidv4 = require('uuid/v4');

const moduleTested = require('../index');  //  Module to be tested, i.e. the parent module.

const moduleName = 'sigfox-aws';
const should = chai.should();
chai.use(chaiAsPromised);
let req = {};

/* eslint-disable quotes */
const testDevice1 = 'UNITTEST1';

const testData = {  //  Structured msgs with numbers and text fields.
  number: '920e06272731741db051e600',
  text: '8013e569a0138c15c013f929',
};
const testBody = (timestamp, device, data) => ({
  deviceLat: 1.303224739957452,
  deviceLng: 103.86088826178306,
  data,
  ctr: 123,
  lig: 456,
  tmp: parseFloat(
    (36.0 + (Math.random() * 10.0)
    ).toFixed(1)),
  longPolling: false,
  device,
  ack: false,
  station: "0000",
  avgSnr: 15.54,
  timestamp: `${timestamp}`,
  seqNumber: 1492,
  lat: 1,
  callbackTimestamp: timestamp,
  lng: 104,
  duplicate: false,
  datetime: "2017-05-07 14:30:51",
  baseStationTime: parseInt(timestamp / 1000, 10),
  snr: 18.86,
  seqNumberCheck: null,
  rssi: -123,
  uuid: uuidv4(),
});
const testMessage = (timestamp, device, data) => ({
  history: [
    {
      duration: 0,
      end: timestamp,
      timestamp,
      function: "sigfoxCallback",
      latency: null,
    },
  ],
  query: {
    type: moduleName,
  },
  route: [],
  device,
  body: testBody(timestamp, device, data),
  type: moduleName,
});
/* eslint-enable quotes */

function startDebug() {
  //  Stub for setting breakpoints on exception.
}

function getTestMessage(type, device) {
  //  Return a copy of the test message with timestamp updated.
  const timestamp = Date.now();
  return testMessage(timestamp, device, testData[type]);
}

const completeSegment = {
  "name" : "example.com",
  "id" : "70de5b6f19ff9a0a",
  "start_time" : 1.478293361271E9,
  "trace_id" : "1-581cf771-a006649127e371903a2de979",
  "end_time" : 1.478293361449E9
};

const partialSegment = {
  service: 'myservice',
  version: '1.23',
  user: 'user1',
  "name" : "example.com",
  "id" : "70de5b6f19ff9a0b",
  "start_time" : 1.478293361271E9,
  "trace_id" : "1-581cf771-a006649127e371903a2de979",
  "in_progress": true
};

let testSegment = null;

describe(moduleName, () => {
  //  Test every exposed function in the module.

  beforeEach(() => {
    //  Erase the request object before every test.
    startDebug();
    req = { unittest: true };
  });

  // eslint-disable-next-line arrow-body-style
  afterEach(() => {
    return moduleTested.flushLog(req);
  });

  it('should create segment', () => {
    testSegment = Object.assign({}, partialSegment);
    testSegment.start_time = Date.now() / 1000.0;
    // testSegment.id = '0123456789abcdef';  //  16-digits
    // testSegment.id = '1123456789abcdef';
    const trace_id_time = Math.floor(Date.now() / 1000).toString(16);
    testSegment.id = (`0000000000000000${trace_id_time}`);
    testSegment.id = testSegment.id.substr(testSegment.id.length - 16);  //  16-digits
    // testSegment.trace_id = `1-${trace_id_time}-123456789012345678901234`;  //  8 then 24 hex digits
    testSegment.trace_id = '1-5a1fa47f-214d87333c609e49068f0309';
    debugger;
    const params = {
      TraceSegmentDocuments: [
        JSON.stringify(testSegment),
      ],
    };
    const AWS = moduleTested.getAWS();
    const xray = new AWS.XRay();
    return xray.putTraceSegments(params).promise();
  });

  it('should wait', () => new Promise(resolve => setTimeout(resolve, 5000)));

  it('should close segment', () => {
    testSegment.end_time = Date.now() / 1000.0;
    if (testSegment.in_progress) testSegment.in_progress = false;
    const params = {
      TraceSegmentDocuments: [
        JSON.stringify(testSegment),
      ],
    };
    const AWS = moduleTested.getAWS();
    const xray = new AWS.XRay();
    return xray.putTraceSegments(params).promise();
  });

  it.skip('should log', () => {
    const msg = getTestMessage('number', testDevice1);
    moduleTested.log(req, 'action123/subAction456', { result: 'OK', number: 789, obj: { level1: { level2: {} } }, msg });
    return Promise.resolve('OK');
  });

  it.skip('should log errors', () => {
    const msg = getTestMessage('number', testDevice1);
    moduleTested.log(req, 'action123/subAction456', { error: new Error('This is the error message'), number: 789, obj: { level1: { level2: {} } }, msg });
    return Promise.resolve('OK');
  });

  it.skip('should aggregate values', () => {
    const device = testDevice1;
    const msg = getTestMessage('number', device);
    const scloud = moduleTested;

    const body = Object.assign({}, msg.body);  //  Clone the message body before update.
    let state = {};
    let pastValues = [];
    //  If this Sigfox message has no "tmp" to aggregate, quit.
    if (body.tmp === null || body.tmp === undefined) return Promise.resolve(msg);
    //  Create the SigfoxAggregator Thing if not created.
    return scloud.awsCreateDevice(req, 'SigfoxAggregator')
      //  Read the last 10 "tmp" values from SigfoxAggregator by device ID.
      .then(() => scloud.awsGetDeviceState(req, 'SigfoxAggregator')
        //  In case the device state doesn't exist, return empty state and proceed.
        .catch(() => {}))
      //  result contains {"reported":{"1A2345":[1,2,3],...
      .then((res) => {
        if (res) state = res.reported;
        //  pastValues will contain the last 10 values e.g. [1,2,3]
        if (state && state[device]) pastValues = state[device];
        //  Append the current value to the last 10 values. Latest value at the end.
        pastValues.push(body.tmp);
        //  Remove the oldest value (at the front) if we exceed 10 values.
        if (pastValues.length > 10) pastValues.shift();
        //  Set the sum of the 10 values into the Sigfox message as tmpsum.
        body.tmpsum = pastValues.reduce(  //  Compute the sum of pastValues using reduce function.
          (sum, val) => (sum + val),  //  For every value found in pastValues, add to sum.
          0  //  Initial value of the sum is 0.
        );
        //  Save the 10 values to SigfoxAggregator.
        const newState = {};
        newState[device] = pastValues;
        console.log('Device', device, 'has accumulated', pastValues, 'with sum', body.tmpsum);
        return scloud.awsUpdateDeviceState(req, 'SigfoxAggregator', newState);
      });
  });

  it.skip('should create device', () => {
    const device = testDevice1;
    return moduleTested.awsCreateDevice(req, device);
  });

  it.skip('should update device state', () => {
    const device = testDevice1;
    const msg = getTestMessage('number', device);
    const body = msg.body;
    return moduleTested.awsUpdateDeviceState(req, device, body);
  });

  it.skip('should get device state', () => {
    const device = testDevice1;
    return moduleTested.awsGetDeviceState(req, device);
  });

  it.skip('should publish message and update device state', () => {
    const msg = getTestMessage('number', testDevice1);
    return moduleTested.publishMessage(req, msg, testDevice1, null);
  });
});
