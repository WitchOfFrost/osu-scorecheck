import { pgc, pgp } from "../workarounds/pg.cjs";
import { config } from "../workarounds/selfReloadJson.cjs";

const pgLocal = new pgc({
    user: config.postgres.local.user,
    host: config.postgres.local.host,
    database: config.postgres.local.database,
    port: config.postgres.local.port
});
pgLocal.connect();

const pgRemote = new pgc({
    user: config.postgres.remote.user,
    host: config.postgres.remote.host,
    database: config.postgres.remote.database,
    port: config.postgres.remote.port
});
pgRemote.connect();

export class dbWorker {
    /**
     * 
     * @param (string) type 
     * @param (string) query 
     * @param (array) arguments 
     * @returns 
     */
    static async query(type, query, args) {
        if (type == "local") {
            return new Promise(async (resolve) => {
                pgLocal.query(query, args).then(res => {
                    resolve(res);
                }).catch(e => console.error(e.stack));
            });
        } else if (type == "remote") {
            return new Promise(async (resolve) => {
                pgRemote.query(query, args).then(res => {
                    resolve(res);
                }).catch(e => console.error(e.stack));
            });
        } else return (false);
    };
};