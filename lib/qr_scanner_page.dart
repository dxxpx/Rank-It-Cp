// import 'dart:convert';
// import 'dart:developer';
// import 'package:flutter/material.dart';
// import 'package:flutter/services.dart';
// import 'package:permission_handler/permission_handler.dart';
// import 'package:qr_code_scanner/qr_code_scanner.dart';
// import 'team_info_page.dart';
//
// class QRScannerPage extends StatefulWidget {
//   @override
//   _QRScannerPageState createState() => _QRScannerPageState();
// }
//
// class _QRScannerPageState extends State<QRScannerPage> {
//   final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');
//   QRViewController? controller;
//   Map<String, dynamic>? teamData;
//   bool hasPermission = false;
//   bool isFlashOn = false;
//
//   @override
//   void initState() {
//     super.initState();
//     requestCameraPermission();
//     loadTeamData();
//   }
//
//   @override
//   void dispose() {
//     controller?.dispose();
//     super.dispose();
//   }
//
//   Future<void> requestCameraPermission() async {
//     var status = await Permission.camera.status;
//     if (!status.isGranted) {
//       status = await Permission.camera.request();
//     }
//     setState(() => hasPermission = status.isGranted);
//     if (!hasPermission) showPermissionDeniedDialog();
//   }
//
//   void showPermissionDeniedDialog() {
//     showDialog(
//       context: context,
//       builder:
//           (_) => AlertDialog(
//             title: Text('Permission Required'),
//             content: Text('Camera permission is required to scan QR codes.'),
//             actions: [
//               TextButton(
//                 onPressed: () => Navigator.pop(context),
//                 child: Text('OK'),
//               ),
//             ],
//           ),
//     );
//   }
//
//   Future<void> loadTeamData() async {
//     String jsonString = await rootBundle.loadString('assets/team.json');
//     teamData = json.decode(jsonString);
//   }
//
//   void _onQRViewCreated(QRViewController ctrl) {
//     controller = ctrl;
//     ctrl.scannedDataStream.listen((scanData) {
//       final String? teamId = scanData.code?.trim();
//
//       if (teamId != null && teamData != null && teamData!.containsKey(teamId)) {
//         controller?.pauseCamera();
//         print('TEAM DATA = ${teamData![teamId]!}');
//         Navigator.push(
//           context,
//           MaterialPageRoute(
//             builder:
//                 (_) => TeamInfoPage(data: teamData![teamId]!, teamId: teamId),
//           ),
//         ).then((_) => controller?.resumeCamera());
//       } else {
//         ScaffoldMessenger.of(context).showSnackBar(
//           SnackBar(content: Text('Invalid QR or team not found!')),
//         );
//       }
//     });
//   }
//
//   @override
//   Widget build(BuildContext context) {
//     return Scaffold(
//       appBar: PreferredSize(
//         preferredSize: Size.fromHeight(100),
//         child: AppBar(
//           backgroundColor: Colors.purple,
//           flexibleSpace: Padding(
//             padding: const EdgeInsets.only(
//               left: 20.0,
//               right: 20.0,
//               top: 20.0,
//               bottom: 5.0,
//             ),
//             child: Row(
//               mainAxisAlignment: MainAxisAlignment.spaceBetween,
//               children: [
//                 Image.asset(
//                   'assets/logo.png',
//                   height: 150,
//                   width: 150,
//                   fit: BoxFit.contain,
//                 ),
//                 Image.asset(
//                   'assets/cslogo.png',
//                   height: 150,
//                   width: 150,
//                   fit: BoxFit.contain,
//                 ),
//               ],
//             ),
//           ),
//         ),
//       ),
//
//       body:
//           hasPermission
//               ? Column(
//                 children: [
//                   Padding(
//                     padding: const EdgeInsets.symmetric(vertical: 16.0),
//                     child: Text(
//                       'Scan the Team QR',
//                       style: TextStyle(
//                         fontSize: 22,
//                         fontWeight: FontWeight.bold,
//                         color: Colors.deepPurple,
//                       ),
//                     ),
//                   ),
//                   Expanded(
//                     child: Stack(
//                       children: [
//                         QRView(
//                           key: qrKey,
//                           onQRViewCreated: _onQRViewCreated,
//                           overlay: QrScannerOverlayShape(
//                             borderColor: Colors.green,
//                             borderRadius: 10,
//                             borderLength: 30,
//                             borderWidth: 10,
//                             cutOutSize: MediaQuery.of(context).size.width * 0.7,
//                           ),
//                         ),
//                         Positioned(
//                           bottom: 20,
//                           left: 0,
//                           right: 0,
//                           child: Center(
//                             child: ElevatedButton.icon(
//                               icon: Icon(
//                                 isFlashOn ? Icons.flash_off : Icons.flash_on,
//                               ),
//                               label: Text(isFlashOn ? 'Flash Off' : 'Flash On'),
//                               onPressed: () async {
//                                 await controller?.toggleFlash();
//                                 bool? flashStatus =
//                                     await controller?.getFlashStatus();
//                                 setState(
//                                   () => isFlashOn = flashStatus ?? false,
//                                 );
//                               },
//                             ),
//                           ),
//                         ),
//                       ],
//                     ),
//                   ),
//                 ],
//               )
//               : Center(child: Text('Requesting camera permission...')),
//     );
//   }
// }
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ieee_scanner_application/Constants.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import 'team_info_page.dart';
import 'Rankings.dart';

class QRScannerPage extends StatefulWidget {
  @override
  _QRScannerPageState createState() => _QRScannerPageState();
}

class _QRScannerPageState extends State<QRScannerPage> {
  final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');
  QRViewController? controller;
  Map<String, dynamic>? teamData;
  bool hasPermission = false;
  bool isFlashOn = false;
  bool isCameraPaused = false;
  final TextEditingController teamCodeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    requestCameraPermission();
    loadTeamData();
  }

  @override
  void dispose() {
    controller?.dispose();
    teamCodeController.dispose();
    super.dispose();
  }

  Future<void> requestCameraPermission() async {
    var status = await Permission.camera.status;
    if (!status.isGranted) {
      status = await Permission.camera.request();
    }
    setState(() => hasPermission = status.isGranted);
    if (!hasPermission) showPermissionDeniedDialog();
  }

  void showPermissionDeniedDialog() {
    showDialog(
      context: context,
      builder:
          (_) => AlertDialog(
            title: Text('Permission Required'),
            content: Text('Camera permission is required to scan QR codes.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text('OK'),
              ),
            ],
          ),
    );
  }

  Future<void> loadTeamData() async {
    String jsonString = await rootBundle.loadString('assets/team.json');
    teamData = json.decode(jsonString);
  }

  void _onQRViewCreated(QRViewController ctrl) {
    controller = ctrl;
    ctrl.scannedDataStream.listen((scanData) async {
      final String? teamId = scanData.code?.trim();

      if (teamId != null && teamData != null && teamData!.containsKey(teamId)) {
        controller?.pauseCamera();
        setState(() => isCameraPaused = true);
        Navigator.push(
          context,
          MaterialPageRoute(
            builder:
                (_) => TeamInfoPage(data: teamData![teamId]!, teamId: teamId),
          ),
        ).then((_) async {
          await controller?.resumeCamera();
          setState(() => isCameraPaused = false);
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Invalid QR or team not found!')),
        );
      }
    });
  }

  void _showTeamCodeInput() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(25)),
      ),
      builder: (BuildContext context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 30,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                "Enter Team Code",
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.deepPurple,
                ),
              ),
              SizedBox(height: 20),
              Container(
                decoration: BoxDecoration(
                  color: Colors.deepPurple[50],
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: Colors.deepPurple, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.deepPurple.shade100,
                      blurRadius: 8,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: TextField(
                  controller: teamCodeController,
                  decoration: InputDecoration(
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    border: InputBorder.none,
                    hintText: 'e.g., XYN25-001',
                  ),
                ),
              ),
              SizedBox(height: 20),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  padding: EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () {
                  String code = teamCodeController.text.trim();
                  if (code.isNotEmpty &&
                      teamData != null &&
                      teamData!.containsKey(code)) {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder:
                            (_) => TeamInfoPage(
                              data: teamData![code]!,
                              teamId: code,
                            ),
                      ),
                    );
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Invalid team code!')),
                    );
                  }
                },
                child: Text("Submit", style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.purple,
        flexibleSpace: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: _showTeamCodeInput,
              child: Image.asset(
                'assets/logo.png',
                height: 120,
                width: 120,
                fit: BoxFit.fitWidth,
              ),
            ),
            Text(
              textAlign: TextAlign.center,
              "EVAL SCANNER",
              style: TextStyle(
                fontFamily: "Luxurious Roman",
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
      body:
          hasPermission
              ? Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16.0),
                    child: Text(
                      'UNLEASH THE CODER INSIDE YOU',
                      style: TextStyle(
                        fontFamily: "Luxurious Roman",
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.deepPurple,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Stack(
                      children: [
                        QRView(
                          key: qrKey,
                          onQRViewCreated: _onQRViewCreated,
                          overlay: QrScannerOverlayShape(
                            borderColor: Colors.green,
                            borderRadius: 10,
                            borderLength: 30,
                            borderWidth: 10,
                            cutOutSize: MediaQuery.of(context).size.width * 0.7,
                          ),
                        ),
                        if (isCameraPaused)
                          Center(
                            child: Container(
                              height: MediaQuery.of(context).size.width * 0.7,
                              width: MediaQuery.of(context).size.width * 0.7,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                color: Colors.white.withOpacity(0.8),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: Image.asset(
                                  'assets/xyntra-logo.png',
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                          ),

                        Positioned(
                          bottom: 120,
                          left: 0,
                          right: 0,
                          child: Center(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: ieee_offl_color.withOpacity(
                                  0.75,
                                ),
                                padding: EdgeInsets.symmetric(
                                  horizontal: 20,
                                  vertical: 12,
                                ),
                              ),
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => TeamRankingsPage(),
                                  ),
                                );
                              },
                              child: Text(
                                'RANKINGS',
                                style: TextStyle(
                                  fontSize: 16,
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          bottom: 30,
                          left: 20,
                          right: 20,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              ElevatedButton.icon(
                                icon: Icon(
                                  isFlashOn ? Icons.flash_off : Icons.flash_on,
                                  color: Colors.white,
                                ),
                                label: Text(
                                  isFlashOn ? 'FLASH OFF' : 'FLASH ON',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: ieee_offl_color.withOpacity(
                                    0.75,
                                  ),
                                  padding: EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 10,
                                  ),
                                ),
                                onPressed: () async {
                                  await controller?.toggleFlash();
                                  bool? flashStatus =
                                      await controller?.getFlashStatus();
                                  setState(
                                    () => isFlashOn = flashStatus ?? false,
                                  );
                                },
                              ),
                              ElevatedButton.icon(
                                icon: Icon(
                                  isCameraPaused
                                      ? Icons.play_arrow
                                      : Icons.pause,
                                  color: Colors.white,
                                ),
                                label: Text(
                                  isCameraPaused ? 'RESUME' : 'PAUSE',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: ieee_offl_color.withOpacity(
                                    0.75,
                                  ),
                                  padding: EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 10,
                                  ),
                                ),
                                onPressed: () async {
                                  if (isCameraPaused) {
                                    await controller?.resumeCamera();
                                  } else {
                                    await controller?.pauseCamera();
                                  }
                                  setState(
                                    () => isCameraPaused = !isCameraPaused,
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              )
              : Center(child: Text('Requesting camera permission...')),
    );
  }
}
