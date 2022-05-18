import './types.js';
import EventEmitter from 'events';
import axios from 'axios';
import WebSocket from 'ws';
import fs from 'fs';
import qs from 'qs';
import { ConfigIniParser } from 'config-ini-parser';

class BinanceWebsocket extends EventEmitter {
    endpoint: string;
    port: number;
    ws: WebSocket;
    subscriptions: Set<string>;

    constructor(configParser: ConfigIniParser) {
        super();
        this.subscriptions = new Set<string>();
        this.endpoint = configParser.get('websocket', 'endpoint');
        this.port = configParser.get('websocket', 'port');
        this.ws = new WebSocket(this.endpoint, {
            port: this.port
        });

        this.ws.on('message', this.onMessage.bind(this));
    }

    private onMessage(data: WebSocket.RawData) {
        let response = JSON.parse(data.toString());
        if(response.hasOwnProperty('code') && response.hasOwnProperty('msg')) {
            throw {code: response.code, message: response.msg};
        }

        let wsResponse = response as WebsocketResponse;

        switch(wsResponse.e) {
        case 'kline':
            this.emit('kline', (response as any).k as WebsocketKline);
        default:
        }
    }

    private subscribe(streams: string[]) {
        const request = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 0
        };

        this.ws.send(JSON.stringify(request));
    }

    private unsubscribe(streams: string[]) {
        const request = {
            method: 'UNSUBSCRIBE',
            params: streams,
            id: 0
        }

        this.ws.send(JSON.stringify(request));
    }

    candlesticks(instrument: string, interval: KlineInterval, callback: (response: KlineResponse) => void) {
        let streamName = `${instrument.toLowerCase()}@kline_${interval}`;
        let hasSubscribtion = this.subscriptions.has(streamName);

        if(!hasSubscribtion) {
            this.ws.on('open', () => {
                this.subscribe([streamName]);
                this.subscriptions.add(streamName);
            });
        }

        this.on('kline', (kline: WebsocketKline) => {
            let isKlineClosed = kline.x;
            if(!isKlineClosed) {
                return;
            }

            callback({
                openTime: kline.t,
                open: +kline.o,
                high: +kline.h,
                low: +kline.l,
                close: +kline.c,
                volume: +kline.v,
                closeTime: kline.T,
                quoteAssetVolume: +kline.q,
                numberOfTrades: kline.n,
                takerBuyBaseAssetVolume: +kline.V,
                takerBuyQuoteAssetVolume: +kline.Q
            });
        });
    }

    close() {
        this.unsubscribe(Array.from(this.subscriptions));
        this.ws.close();
    }
}

class BinancePublicData {
    endpoints: string[];
    klinesPath: string;
    configParser: ConfigIniParser;
    websocket: BinanceWebsocket;

    constructor() {
        this.configParser = new ConfigIniParser('\n');
        
        let config = fs.readFileSync('./config.cfg', 'utf8');
        this.configParser.parse(config);

        this.endpoints = this.configParser.getOptionFromDefaultSection('endpoints').split(" ");
        this.klinesPath = this.configParser.getOptionFromDefaultSection('klines');

        this.websocket = new BinanceWebsocket(this.configParser);
    }

    private async request(data: object, path: string) {
        const url = `${this.endpoints[0]}${path}?${qs.stringify(data)}`;

        return axios.get(url).then(res => {
            if(res.data.hasOwnProperty('code') && res.data.hasOwnProperty('msg')) {
                throw {code: res.data.code, message: res.data.msg};
            }

            return res.data;
        });
    }

    async candlesticks(data: KlineRequest) {
        return this.request(data, this.klinesPath).then(res => {
            let klines = new Array<KlineResponse>();
            for(const kline of res) {
                klines.push({
                    openTime: +kline[0],
                    open: +kline[1],
                    high: +kline[2],
                    low: +kline[3],
                    close: +kline[4],
                    volume: +kline[5],
                    closeTime: +kline[6],
                    quoteAssetVolume: +kline[7],
                    numberOfTrades: +kline[8],
                    takerBuyBaseAssetVolume: +kline[9],
                    takerBuyQuoteAssetVolume: +kline[10]
                });
            }

            return klines;
        });
    }
}

export default BinancePublicData;