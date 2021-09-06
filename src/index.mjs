import axios from "axios";

import { config } from './workarounds/selfReloadJson.cjs';
import { apiMain } from './api/express.mjs';
import { fileWorker } from './workers/file.mjs';
import { dbWorker } from './workers/database.mjs';

export let queue = []

let token;
let refresh = 0;

setInterval(processQueue, 1000);
apiMain();

async function refreshToken() {
    return new Promise(async (resolve, reject) => {
        await axios({
            url: "https://osu.ppy.sh/oauth/token",
            method: "post",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            data: {
                "grant_type": "client_credentials",
                "client_id": config.osu.id,
                "client_secret": config.osu.secret,
                "scope": "public"
            }
        }).then(data => {
            refresh = Date.now() + (data.data.expires_in * 1000);
            console.log("Token refreshed.")
            resolve('Bearer ' + data.data.access_token);
        }).catch(err => {
            reject(err);
        });
    });
}

async function calcModEnum(mods) {
    return new Promise(async (resolve) => {
        let calc = { enum: 0, is_hd: false, is_hr: false, is_dt: false, is_fl: false, is_ht: false, is_ez: false, is_nf: false, is_nc: false, is_td: false, is_so: false, is_sd: false, is_pf: false };
        mods.forEach(mod => {
            switch (mod) {
                case "NF":
                    calc.enum = calc.enum + 1;
                    calc.is_nf = true;
                    break;
                case "EZ":
                    calc.enum = calc.enum + 2;
                    calc.is_ez = true;
                    break;
                case "HD":
                    calc.enum = calc.enum + 8;
                    calc.is_hd = true;
                    break;
                case "HR":
                    calc.enum = calc.enum + 16;
                    calc.is_hr = true;
                    break;
                case "DT":
                    calc.enum = calc.enum + 64;
                    calc.is_dt = true;
                    break;
                case "HT":
                    calc.enum = calc.enum + 256;
                    calc.is_ht = true;
                    break;
                case "NC":
                    calc.enum = calc.enum + 576;
                    calc.is_nc = true;
                    break;
                case "FL":
                    calc.enum = calc.enum + 1024;
                    calc.is_fl = true;
                    break;
                case "SO":
                    calc.enum = calc.enum + 4096;
                    calc.is_so = true;
                    break;
                case "SD":
                    calc.enum = calc.enum + 32;
                    calc.is_sd = true;
                    break;
                case "PF":
                    calc.enum = calc.enum + 16416;
                    calc.is_pf = true;
                    break;
            };
        });
        resolve(calc);
    });
};

async function processQueue() {
    if (queue.length > 0) {
        let score = queue[0];
        queue.shift();

        if (Date.now() > refresh - 5 * 60 * 1000) {
            token = await refreshToken();
        }

        let osuAPI = axios.create({ baseURL: 'https://osu.ppy.sh/api/v2', headers: { 'Authorization': token }, json: true });

        osuAPI.get('/scores/osu/' + score.score_id).then(async res => {
            let mods = await calcModEnum(res.data.mods);
            let apiFormatted = { "score_id": String(res.data.id), "user_id": String(res.data.user_id), "beatmap_id": String(res.data.beatmap.id), "score": String(res.data.score), "count300": String(res.data.statistics.count_300), "count100": String(res.data.statistics.count_100), "count50": String(res.data.statistics.count_50), "countmiss": String(res.data.statistics.count_miss), "combo": String(res.data.max_combo), "perfect": String(Number(res.data.perfect)), "enabled_mods": String(mods.enum), "date_played": String(res.data.created_at.slice(0, 19).split("T").join(" ")), "rank": String(res.data.rank), "pp": String(res.data.pp), "replay_available": String(Number(res.data.replay)) }
            if (JSON.stringify(score) == JSON.stringify(apiFormatted)) {
                await dbWorker.query("remote", `INSERT INTO scores (user_id, beatmap_id, score, count300, count100, count50, countmiss, combo, perfect, enabled_mods, date_played, rank, pp, replay_available, is_hd, is_hr, is_dt, is_fl, is_ht, is_ez, is_nf, is_nc, is_td, is_so, is_sd, is_pf) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) ON CONFLICT ON CONSTRAINT scores_pkey DO UPDATE SET score=$3, count300=$4, count100=$5, count50=$5, countmiss=$7, combo=$8, perfect=$9, enabled_mods=$10, date_played=$11, rank=$12, pp=$13, replay_available=$14, is_hd=$15, is_hr=$16, is_dt=$17, is_fl=$18, is_ht=$19, is_ez=$20, is_nf=$21, is_nc=$22, is_td=$23, is_so=$24, is_sd=$25, is_pf=$26 WHERE excluded.score > scores.score`, [Number(score.user_id), Number(score.beatmap_id), Number(score.score), Number(score.count300), Number(score.count100), Number(score.count50), Number(score.countmiss), Number(score.combo), Number(score.perfect), score.enabled_mods, res.data.created_at, score.rank, Number(score.pp), Number(score.replay_available), Boolean(mods.is_hd), Boolean(mods.is_hr), Boolean(mods.is_dt), Boolean(mods.is_fl), Boolean(mods.is_ht), Boolean(mods.is_ez), Boolean(mods.is_nf), Boolean(mods.is_nc), Boolean(mods.is_td), Boolean(mods.is_so), Boolean(mods.is_sd), Boolean(mods.is_pf)]).catch(err => { console.log(err) });
            } else {
                console.log("Score did not match with the osu!api");
            };
        }).catch(err => {
            if (err.response.status == 404) return;
            if (err.response.status == 525) {
                console.log("SSL Handshake Fail, osu! is probably dead.");
                return;
            }

            console.log(err);
        });
    }
}


export async function validateScores(path) {
    return new Promise(async (resolve) => {

        let parsedCSV = await fileWorker.parseCSV(path);
        let totalProcessed = parsedCSV.length;
        let callback = { totalProcessed: totalProcessed, updatedScores: 0, missingScores: 0, duplicateScores: 0, queueLength: 0, errors: 0 };

        console.log("Recieved CSV with length " + totalProcessed + ", checking with scoredb");

        for (const score of parsedCSV) {
            if (score.user_id == null || score.beatmap_id == null || score.score_id == null) {
                callback.errors++
                return;
            }

            await dbWorker.query("local", `SELECT * FROM scoreid WHERE user_id=$1 AND beatmap_id=$2 LIMIT 1`, [score.user_id, score.beatmap_id]).then(async data => {
                if (data.rows[0] != undefined) {
                    if (score.score_id > data.rows[0].score_id) {
                        queue.push(score);
                        await dbWorker.query("local", `UPDATE scoreid SET score_id=$1 WHERE user_id=$2 AND beatmap_id=$3`, [score.score_id, score.user_id, score.beatmap_id]).then(data => {
                        }).catch(err => {
                            console.log(err);
                            callback.errors++
                        });
                        callback.updatedScores++;
                    } else {
                        callback.duplicateScores++;
                    }
                } else {
                    queue.push(score);
                    await dbWorker.query("local", `INSERT INTO scoreid (score_id, user_id, beatmap_id) VALUES ($1, $2, $3)`, [score.score_id, score.user_id, score.beatmap_id]).then(data => {
                    }).catch(err => {
                        console.log(err);
                        callback.errors++
                    });
                    callback.missingScores++;
                }
            });
        };
        callback.queueLength = queue.length;
        console.log(callback);
        resolve(callback);
        fileWorker.deleteFile(path);
    });
};