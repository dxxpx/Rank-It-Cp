// import 'package:flutter/material.dart';
// import 'package:http/http.dart' as http;
// import 'dart:convert';
//
// class TeamRankingsPage extends StatefulWidget {
//   @override
//   _TeamRankingsPageState createState() => _TeamRankingsPageState();
// }
//
// class _TeamRankingsPageState extends State<TeamRankingsPage> {
//   late Future<List<Map<String, dynamic>>> rankingsFuture;
//
//   @override
//   void initState() {
//     super.initState();
//     rankingsFuture = fetchTeamRankings();
//   }
//
//   Future<List<Map<String, dynamic>>> fetchTeamRankings() async {
//     final url = Uri.parse(
//       'https://script.google.com/macros/s/AKfycbwHIEIx3u0yF7m4M75Kvpw6mUFd1pRaRgeAdJ9dh5pfPUTGM6spcBlDocF9-65m4iSF/exec',
//     );
//
//     final response = await http.get(url);
//
//     if (response.statusCode == 200) {
//       try {
//         final List<dynamic> jsonList = jsonDecode(response.body);
//         for (var team in jsonList) {
//           print("Parsed Team: $team");
//         }
//         return jsonList.cast<Map<String, dynamic>>();
//       } catch (e) {
//         print("Parsing error: ${e.toString()}");
//         return [];
//       }
//     } else {
//       print("HTTP request failed with status ${response.statusCode}");
//       return [];
//     }
//   }
//
//   @override
//   Widget build(BuildContext context) {
//     return Scaffold(
//       appBar: AppBar(title: Text("Team Rankings")),
//       body: FutureBuilder<List<Map<String, dynamic>>>(
//         future: rankingsFuture,
//         builder: (context, snapshot) {
//           if (snapshot.connectionState == ConnectionState.waiting) {
//             return Center(child: CircularProgressIndicator());
//           } else if (snapshot.hasError || !snapshot.hasData || snapshot.data!.isEmpty) {
//             return Center(child: Text("No rankings available."));
//           }
//
//           final rankings = snapshot.data!;
//
//           return ListView.builder(
//             itemCount: rankings.length,
//             itemBuilder: (context, index) {
//               final team = rankings[index];
//               return ListTile(
//                 leading: CircleAvatar(
//                   child: Text('#${index + 1}'),
//                   backgroundColor: Colors.blue.shade100,
//                 ),
//                 title: Text(team['teamName']),
//                 subtitle: Text("Code: ${team['teamCode']}"),
//                 trailing: Text(
//                   "Score: ${team['totalScore']}",
//                   style: TextStyle(fontWeight: FontWeight.bold),
//                 ),
//               );
//             },
//           );
//         },
//       ),
//     );
//   }
// }
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

import 'package:ieee_scanner_application/Constants.dart';

class TeamRankingsPage extends StatefulWidget {
  @override
  _TeamRankingsPageState createState() => _TeamRankingsPageState();
}

class _TeamRankingsPageState extends State<TeamRankingsPage> {
  late Future<List<Map<String, dynamic>>> rankingsFuture;

  @override
  void initState() {
    super.initState();
    rankingsFuture = fetchTeamRankings();
  }

  Future<List<Map<String, dynamic>>> fetchTeamRankings() async {
    final url = Uri.parse(
      'https://script.google.com/macros/s/AKfycbysKWTFo589khYeHqffTf8Qc5t3JkSfX7M4TSX89IT734X3Yr0mTdG5xuBEiUF0JGpI/exec',
    );

    final response = await http.get(url);

    if (response.statusCode == 200) {
      try {
        final List<dynamic> jsonList = jsonDecode(response.body);
        return jsonList.cast<Map<String, dynamic>>();
      } catch (e) {
        print("Parsing error: ${e.toString()}");
        return [];
      }
    } else {
      print("HTTP request failed with status ${response.statusCode}");
      return [];
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("Team Rankings"),
        backgroundColor: ieee_offl_color,
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              Colors.deepPurple.shade50,
              ieee_offl_color.withOpacity(0.001),
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: rankingsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return Center(
                child: CircularProgressIndicator(color: Colors.deepPurple),
              );
            } else if (snapshot.hasError ||
                !snapshot.hasData ||
                snapshot.data!.isEmpty) {
              return Center(child: Text("No rankings available."));
            }

            final rankings = snapshot.data!;

            return ListView.builder(
              itemCount: rankings.length,
              padding: EdgeInsets.all(12),
              itemBuilder: (context, index) {
                final team = rankings[index];
                return Card(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 4,
                  margin: EdgeInsets.symmetric(vertical: 8),
                  color: Colors.white,
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: ieee_offl_color,
                      child: Text(
                        '#${index + 1}',
                        style: TextStyle(color: Colors.black),
                      ),
                    ),
                    title: Text(
                      team['teamName'] ?? 'Unnamed',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text("Code: ${team['teamCode'] ?? 'N/A'}"),
                    trailing: Text(
                      "Score: ${team['totalScore'] ?? 0}",
                      style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
