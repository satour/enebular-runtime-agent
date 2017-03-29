import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import fetch from 'isomorphic-fetch';
import unzip from 'unzip2';

/**
 *
 */
export default class EnebularAgent {
  constructor({ command, args, pkgDir }) {
    this._command = command;
    this._args = args;
    this._pkgDir = pkgDir
  }

  async downloadAndUpdatePackage(downloadUrl) {
    const res = await fetch(downloadUrl);
    if (res.status >= 400) {
      throw new Error('invalid url');
    }
    const params = await res.json();
    return this.updatePackage(params);
  }

  async updatePackage(params) {

    let writeFile = Promise.promisify(fs.writeFile);

    return writeFile(path.join(this._pkgDir, '.node-red-config/flows.json'), JSON.stringify(params.flow) ).then((res) => {
      return writeFile(path.join(this._pkgDir, '.node-red-config/flows_cred.json'), JSON.stringify(params.cred) );
    }).then(() => {
      return writeFile(path.join(this._pkgDir, '.node-red-config/enebular-agent-dynamic-deps/package.json'), JSON.stringify({
        name: "enebular-agent-dynamic-deps",
        version: "0.0.1",
        dependencies: params.packages
      }, null, 2))
    }).then(() => {
      return this.resolveDependency();
    })
  }

  async resolveDependency() {
    return new Promise((resolve, reject) => {
      const cproc = spawn('npm', [ 'install', 'enebular-agent-dynamic-deps' ], { stdio: 'inherit', cwd: this._pkgDir });
      cproc.on('error', reject);
      cproc.once('exit', resolve);
    });
  }

  async startService() {
    return new Promise((resolve, reject) => {
      this._cproc = spawn(this._command, this._args, { stdio: 'inherit', cwd: this._pkgDir });
      this._cproc.on('error', reject);
      this._cproc.once('exit', resolve);
    });
  }

  async shutdownService() {
    return new Promise((resolve, reject) => {
      if (this._cproc) {
        this._cproc.kill();
        this._cproc.once('exit', () => {
          this._cproc = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async restartService() {
    await this.shutdownService();
    await this.startService();
  }
}