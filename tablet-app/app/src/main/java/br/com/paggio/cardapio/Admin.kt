package br.com.paggio.cardapio

import android.app.admin.DeviceAdminReceiver

/** Permite virar "dono do dispositivo" (adb shell dpm set-device-owner) para travar sem pedir confirmação. */
class Admin : DeviceAdminReceiver()
