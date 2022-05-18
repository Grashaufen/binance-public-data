var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import './types.js';
import EventEmitter from 'events';
import axios from 'axios';
import WebSocket from 'ws';
import fs from 'fs';
import qs from 'qs';
import { ConfigIniParser } from 'config-ini-parser';
class BinanceWebsocket extends EventEmitter {
    constructor(configParser) {
        super();
        this.subscribtions = new Set();
        this.endpoint = configParser.get('websocket', 'endpoint');
        this.port = configParser.get('websocket', 'port');
        this.ws = new WebSocket(this.endpoint, {
            port: this.port
        });
        this.ws.on('message', this.onMessage.bind(this));
    }
    onMessage(data) {
        const response = JSON.parse(data.toString());
        switch (response.e) {
            case 'kline':
                this.emit('kline', response.k);
            default:
        }
    }
    subscribe(streams) {
        const request = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 0
        };
        this.ws.send(JSON.stringify(request));
    }
    unsubscribe(streams) {
        const request = {
            method: 'UNSUBSCRIBE',
            params: streams,
            id: 0
        };
        this.ws.send(JSON.stringify(request));
    }
    candlesticks(instrument, interval, callback) {
        let streamName = `${instrument.toLowerCase()}@kline_${interval}`;
        let hasSubscribtion = this.subscribtions.has(streamName);
        if (!hasSubscribtion) {
            this.ws.on('open', () => {
                this.subscribe([streamName]);
                this.subscribtions.add(streamName);
            });
        }
        this.on('kline', (kline) => {
            let isKlineClosed = kline.x;
            if (!isKlineClosed) {
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
        this.unsubscribe(Array.from(this.subscribtions));
        this.ws.close();
    }
}
class BinancePublicData {
    constructor() {
        this.configParser = new ConfigIniParser('\n');
        let config = fs.readFileSync('./config.cfg', 'utf8');
        this.configParser.parse(config);
        this.endpoints = this.configParser.getOptionFromDefaultSection('endpoints').split(" ");
        this.klinesPath = this.configParser.getOptionFromDefaultSection('klines');
        this.websocket = new BinanceWebsocket(this.configParser);
    }
    request(data, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `${this.endpoints[0]}${path}?${qs.stringify(data)}`;
            return axios.get(url).then(res => {
                if (res.data.hasOwnProperty('code') && res.data.hasOwnProperty('msg')) {
                    throw { code: res.data.code, message: res.data.msg };
                }
                return res.data;
            });
        });
    }
    candlesticks(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(data, this.klinesPath).then(res => {
                let klines = new Array();
                for (const kline of res) {
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
        });
    }
}
export default BinancePublicData;
