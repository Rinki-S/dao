import { contextBridge } from "electron";

contextBridge.exposeInMainWorld('dao', {
    appName: 'Dao',
})