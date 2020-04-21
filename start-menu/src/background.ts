'use strict'

import { app, protocol, BrowserWindow, screen, globalShortcut, ipcMain } from 'electron'
import {
  createProtocol, installVueDevtools,
} from 'vue-cli-plugin-electron-builder/lib'

// @ts-ignore
import dbus from "dbus-native";

const isDevelopment = process.env.NODE_ENV !== 'production'

let win: BrowserWindow | null = null;
let isWinVisible = false;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true } }])

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 0, height: 0,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    titleBarStyle: "hidden",
    show: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false,
      disableHtmlFullscreenWindowResize: true
    }
  });
  win.setSkipTaskbar(true);

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayMatching({ x: cursorPoint.x, y: cursorPoint.y, height: 1, width: 1 });
  win.setPosition(display.bounds.x + 10, display.bounds.y + display.workAreaSize.height - 500);

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)

    if (!process.env.IS_TEST) {
      win.webContents.openDevTools();
    }
  }
  else {
    createProtocol('app')
    win.loadURL('app://./index.html')
  }

  win.on('closed', () => {
    win = null
  });

  ipcMain.on("hide-me", () => {
    if (!win) {
      return;
    }

    win.setResizable(true);
    win.setSize(0, 0, true);
    isWinVisible = false;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    try {
      await installVueDevtools()
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }

  createWindow();


  function toggleVisibility(): void {
    if (!win) {
      return;
    }

    if (isWinVisible) {
      win.setResizable(true);
      win.setSize(0, 0, true);
      isWinVisible = false;
      win.webContents.send("hide");
    }
    else {
      const cursorPoint = screen.getCursorScreenPoint();
      const display = screen.getDisplayMatching({ x: cursorPoint.x, y: cursorPoint.y, height: 1, width: 1 });
      win.setPosition(display.bounds.x + 10, display.bounds.y + display.workAreaSize.height - 500);
      win.setResizable(true);
      win.setSize(400, 510, true);
      isWinVisible = true;
      win.setResizable(false);
      win.setSkipTaskbar(true);
      win.focus();
      win.webContents.send("show");
    }
  }

  const sessionBusAddress = process.env.DBUS_SESSION_BUS_ADDRESS;
  var bus = dbus.sessionBus({ busAddress: sessionBusAddress });
  var name = 'lawl.visibilityToggler';
  bus.connection.on('message', function (msg: any) {
    if (msg.destination === name && msg['interface'] === name) {
      toggleVisibility();
    }
  });
  bus.requestName(name, 0);
});


// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
