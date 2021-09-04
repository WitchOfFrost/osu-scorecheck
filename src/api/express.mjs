process.chdir(`${process.cwd()}/src`);

import express from 'express';
import morgan from 'morgan';

import { expressUploader } from "../workarounds/expressUpload.cjs";

import { validateScores, queue } from '../index.mjs';
import { config } from '../workarounds/selfReloadJson.cjs';

const api = express();

function pre(api) {
    expressUploader(api);
} pre(api);

export async function apiMain() {
    if (["tiny", "dev"].indexOf(config.api.general.logging) > -1) {
        api.use(morgan(config.api.general.logging));
    }

    api.listen(config.api.general.port, () => {
        console.log("API running on port " + config.api.general.port);
    });

    api.post('/import', async (req, res) => {
        if (config.api.import.enabled == false) {
            res.status(423);
            res.json({ error: "Import is currently disabled." });
        } else if (queue.length > config.api.import.queueLimit) {
            res.status(423);
            res.json({ error: "Import queue exceeds the limit. Import is temporarily disabled." });
        } else {
            let sentToken = req.headers["x-access-token"] || req.headers["authorization"];

            if (config.api.import.authentication.enabled === true) {
                if (!sentToken) {
                    res.status(401);
                    res.json({ error: "Access denied. No token provided." });
                    return;
                } else if (sentToken != config.api.import.authentication.token) {
                    res.status(403);
                    res.json({ error: "Invalid token." });
                    return;
                };
            };

            if (!req.files) {
                res.status(400);
                res.json({ error: "No file uploaded." });
                return;
            } else {
                let file = req.files.csv;
                let fileExt = file.name.split(".").pop();
                let fileName = "file_" + Math.floor(Math.random() * 10000);
                let path = "" + process.cwd().replaceAll("\\", "/") + `/api/cache/${fileName}.${fileExt}`

                if (["csv"].indexOf(fileExt) < 0) {
                    res.status(400);
                    res.json({ error: "Unsupported file-type." });
                    return;
                };

                await file.mv(`./api/cache/${fileName}.${fileExt}`);

                let callback = await validateScores(path);
                res.status(200);
                res.json({
                    message: "Successfully uploaded", totalProcessed: callback.totalProcessed, updatedScores: callback.updatedScores, missingScores: callback.missingScores, duplicateScores: callback.duplicateScores, queueLength: callback.queueLength, eta: `~${Math.round(callback.queueLength / 60)} Minutes `
                });
            };
        }
    });
}