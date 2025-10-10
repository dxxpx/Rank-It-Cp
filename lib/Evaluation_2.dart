import 'dart:convert';
import 'dart:developer';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ieee_scanner_application/Constants.dart';
import 'package:ieee_scanner_application/widgets/success_snackbar.dart';

class Evaluation_Page extends StatefulWidget {
  final String teamCode;
  final String teamName;
  final int evalution_number;
  final Map<String, dynamic>? marksData;
  Evaluation_Page({
    required this.teamCode,
    required this.teamName,
    required this.evalution_number,
    this.marksData,
  });

  @override
  _Evaluation_PageState createState() => _Evaluation_PageState();
}

class _Evaluation_PageState extends State<Evaluation_Page> {
  final _formKey = GlobalKey<FormState>();
  bool firstEvaluationDone = false;
  final Map<String, TextEditingController> controllers = {};
  final Map<String, bool> editableFields = {};

  final Map<String, dynamic> formData = {
    "teamCode": "",
    "teamName": "",
    "clarity": null,
    "progress": null,
    "technicalDepth": null,
    "innovation": null,
    "collaboration": null,
    "scalability": null,
    "businessModel": null,
  };
  bool _formSubmitted = false;

  @override
  void initState() {
    super.initState();
    formData['teamCode'] = widget.teamCode;
    formData['teamName'] = widget.teamName;
    if (widget.marksData != null) {
      formData['clarity'] = widget.marksData!['problemClarity'];
      formData['progress'] = widget.marksData!['progress'];
      formData['technicalDepth'] = widget.marksData!['technicalDepth'];
      formData['innovation'] = widget.marksData!['innovation'];
      formData['collaboration'] = widget.marksData!['collaboration'];
      formData['scalability'] = widget.marksData!['scalability'];
      formData['businessModel'] = widget.marksData!['businessModel'];
    }
    ;
    final keys = [
      'clarity',
      'progress',
      'technicalDepth',
      'innovation',
      'collaboration',
      'scalability',
      if (widget.evalution_number == 2) 'businessModel',
    ];
    for (var key in keys) {
      final value =
          widget.marksData?[key] ?? widget.marksData?[_convertKey(key)] ?? '';
      formData[key] = _safeParseDouble(value);
      controllers[key] = TextEditingController(text: value?.toString() ?? '');
      editableFields[key] =
          value == '' || value == null; // disable if pre-filled
    }
    checkFirstEvaluationStatus();
  }

  double? _safeParseDouble(dynamic value) {
    if (value == null || value == '') return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  String _convertKey(String key) {
    // Converts camelCase to expected Google Sheet field names if needed
    switch (key) {
      case 'clarity':
        return 'problemClarity';
      case 'progress':
        return 'progress';
      case 'technicalDepth':
        return 'technicalDepth';
      case 'innovation':
        return 'innovation';
      case 'collaboration':
        return 'collaboration';
      case 'scalability':
        return 'scalability';
      case 'businessModel':
        return 'businessModel';
      default:
        return key;
    }
  }

  Future<void> checkFirstEvaluationStatus() async {
    final url = Uri.parse(
      'https://script.google.com/macros/s/AKfycbwaGc1uKBHC9K6U1PNEvdvq9IzuS5MPBFZ_W-Doti93okBGWkfxCdJMWsY84QLYrPC_/exec',
    );
    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data != null &&
            (data['clarity'] != null ||
                data['progress'] != null ||
                data['technicalDepth'] != null ||
                data['innovation'] != null ||
                data['collaboration'] != null ||
                data['scalability'] != null)) {
          setState(() {
            firstEvaluationDone = true;
          });
        }
      }
    } catch (e) {
      print('Error checking evaluation status: $e');
    }
  }

  // Future<void> _submitForm() async {
  //   if (_formKey.currentState!.validate()) {
  //     _formKey.currentState!.save();
  //
  //     log("CLICKED");
  //
  //     double total =
  //         (formData['clarity'] ?? 0).toDouble() +
  //         (formData['progress'] ?? 0).toDouble() +
  //         (formData['technicalDepth'] ?? 0).toDouble() +
  //         (formData['innovation'] ?? 0).toDouble() +
  //         (formData['collaboration'] ?? 0).toDouble() +
  //         (formData['scalability'] ?? 0).toDouble();
  //
  //     Map<String, dynamic> finalData = {
  //       ...formData,
  //       'totalScore': total.round(),
  //       'eval_sheet': widget.evalution_number == 1 ? "E1 Scores" : "E2 Scores",
  //     };
  //     final String url =
  //         "https://script.google.com/macros/s/AKfycbwaGc1uKBHC9K6U1PNEvdvq9IzuS5MPBFZ_W-Doti93okBGWkfxCdJMWsY84QLYrPC_/exec";
  //     final response = await http.post(
  //       Uri.parse(url),
  //       headers: {"Content-Type": "application/json"},
  //       body: jsonEncode(finalData),
  //     );
  //     if (response.statusCode == 200) {
  //       ScaffoldMessenger.of(context).showSnackBar(
  //         SnackBar(
  //           content: Text('Scores updated successfully!'),
  //           backgroundColor: Colors.green,
  //         ),
  //       );
  //     } else {
  //       throw Exception('Failed to update');
  //     }
  //     log('${response.body}');
  //   }
  // }
  Future<void> _submitForm() async {
    if (_formKey.currentState!.validate()) {
      _formKey.currentState!.save();

      log("CLICKED SUBMIT. Evaluation = ${widget.evalution_number}");

      double total =
          (formData['clarity'] ?? 0).toDouble() +
          (formData['progress'] ?? 0).toDouble() +
          (formData['technicalDepth'] ?? 0).toDouble() +
          (formData['innovation'] ?? 0).toDouble() +
          (formData['collaboration'] ?? 0).toDouble() +
          (formData['scalability'] ?? 0).toDouble() +
          (widget.evalution_number == 2
              ? (formData['businessModel'] ?? 0).toDouble()
              : 0);

      Map<String, dynamic> finalData = {
        ...formData,
        'totalScore': total.round(),
        'eval_num': widget.evalution_number,
        'eval_sheet': widget.evalution_number == 1 ? "E1 Scores" : "E2 Scores",
      };
      if (widget.evalution_number == 1) {
        finalData.remove('businessModel');
      }
      log('Final Data : ${jsonEncode(finalData)}');
      final String url =
          "https://script.google.com/macros/s/AKfycbyEUcAuwFzrTV_6ia2i-vDEmvwV35vHdizEkNkJpdBpCumXZA8uy-1NfjCZ07GiP6Yr/exec";

      try {
        final response = await http.post(
          Uri.parse(url),
          headers: {"Content-Type": "application/json"},
          body: jsonEncode(finalData),
        );

        showSuccessSnackBar(
          context: context,
          message: "Update Score Successfully",
        );
        setState(() {
          _formSubmitted = true;
          for (var key in editableFields.keys) {
            editableFields[key] = false;
          }
        });
      } catch (e) {
        log('ERRRRRRORRRR : $e');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update scores'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Widget _scoreInput(String label, String key, double maxScore) {
    final controller = controllers[key]!;
    final isEditable = editableFields[key] ?? true;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: RichText(
              text: TextSpan(
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: Colors.black,
                ),
                //TODO CHANGE TO NEW LINE
                children: [
                  TextSpan(text: "$label "),
                  TextSpan(
                    text: "(out of ${maxScore.toInt()})",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.normal,
                      color: Colors.grey[700],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            flex: 1,
            child: TextFormField(
              controller: controller,
              keyboardType: TextInputType.number,
              enabled: isEditable,
              decoration: InputDecoration(
                isDense: true,
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 10,
                ),
                filled: true,
                fillColor:
                    isEditable
                        ? Colors.purple.shade50
                        : ieee_offl_color.withOpacity(0.75),
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) return 'Required';
                final number = double.tryParse(value);
                if (number == null) return 'Enter valid number';
                if (number > maxScore) return 'Max: $maxScore';
                return null;
              },
              onChanged: (value) {
                setState(() {
                  formData[key] = double.tryParse(value);
                });
              },
            ),
          ),
          IconButton(
            icon: Icon(Icons.edit, color: Colors.blue),
            onPressed: () {
              setState(() {
                editableFields[key] = true;
              });
            },
          ),
          IconButton(
            icon: Icon(Icons.delete, color: Colors.red),
            onPressed: () {
              setState(() {
                controller.clear();
                formData[key] = null;
                editableFields[key] = true;
              });
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pop(context, _formSubmitted);
        return false;
      },
      child: Scaffold(
        backgroundColor: Colors.purple[50],
        appBar: AppBar(
          leading: IconButton(
            onPressed: () {
              Navigator.pop(context, _formSubmitted);
            },
            icon: Icon(Icons.arrow_back),
          ),
          backgroundColor: ieee_offl_color,
          elevation: 0,
          title: Text(
            'XYNTRA 25 EVAL SCANNER',
            style: TextStyle(fontSize: 14, color: Colors.black),
          ),
          centerTitle: true,
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                Container(
                  color: ieee_offl_color.withOpacity(0.75),
                  padding: const EdgeInsets.all(12),
                  child: Center(
                    child: Text(
                      widget.teamName.toUpperCase(),
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        color: Colors.black,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                _scoreInput("Problem Clarity", "clarity", 15),
                _scoreInput("Progress", "progress", 25),
                _scoreInput("Technical Depth", "technicalDepth", 20),
                _scoreInput("Innovation", "innovation", 15),
                _scoreInput("Collaboration", "collaboration", 10),
                _scoreInput("Scalability", "scalability", 10),
                if (widget.evalution_number == 2)
                  _scoreInput("Business Model", "businessModel", 25),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: Text(
                        "TOTAL SCORE :",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    Expanded(
                      flex: 1,
                      child: Container(
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: ieee_offl_color.withOpacity(0.75),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          (() {
                            double total =
                                (formData['clarity'] ?? 0).toDouble() +
                                (formData['progress'] ?? 0).toDouble() +
                                (formData['technicalDepth'] ?? 0).toDouble() +
                                (formData['innovation'] ?? 0).toDouble() +
                                (formData['collaboration'] ?? 0).toDouble() +
                                (formData['scalability'] ?? 0).toDouble() +
                                (widget.evalution_number == 2
                                    ? (formData['businessModel'] ?? 0)
                                        .toDouble()
                                    : 0);
                            return total.round().toString();
                          })(),
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 30),
                Column(
                  children: [
                    ElevatedButton(
                      onPressed: _submitForm,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ieee_offl_color.withOpacity(0.75),
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.symmetric(vertical: 16),
                        textStyle: TextStyle(fontSize: 16),
                        minimumSize: Size(double.infinity, 50),
                      ),
                      child: Text(
                        'UPDATE SCORE',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        Navigator.pop(context);
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.purple[800],
                        side: BorderSide(color: Colors.purple),
                        padding: EdgeInsets.symmetric(vertical: 16),
                        textStyle: TextStyle(fontSize: 16),
                        minimumSize: Size(double.infinity, 50), // Full width
                      ),
                      child: Text('NEXT QR'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
