import * as admin from "firebase-admin";
import { DocumentReference, DocumentSnapshot } from "@google-cloud/firestore";

const matches = admin.firestore().collection("matches");
const users = admin.firestore().collection("users");

export async function playMove(request: any, response: any) {
  const userId: string = request.query.userId;
  const matchId: string = request.query.matchId;
  const newGf: string = request.query.newGf;
  const newTarget: string = request.query.newTarget;
  const done: boolean = request.query.done == "true";
  const moves: number = +request.query.moves;
  const matchDoc: DocumentSnapshot = await matches.doc(matchId).get();
  if (isPlayer(userId, matchDoc)) {
    try {
      await updateMatch(userId, matchDoc, newGf, newTarget, moves);
      if (done) await setPlayerDone(userId, matchDoc);
      response.send(true);
      if (done && isOtherPlayerDone(userId, matchDoc)) {
        declareWinner(matchDoc);
      }
    } catch (e) {
      console.log("--- error applying player move");
      console.error(Error(e));
      response.status(500).send("Error playing move");
    }
  } else {
    console.log("--- error user neither host nor join");
    response.status(500).send("Error: user neither host nor join");
  }
}

export async function forfeit(request: any, response: any) {
  const userId: string = request.query.userId;
  const matchId: string = request.query.matchId;
  const matchDoc: DocumentSnapshot = await matches.doc(matchId).get();
  try {
    if (matchDoc.data()!.winner == null) {
      if (userId == matchDoc.data()!.hostuid) {
        await upWinAmount(matchDoc, false, true);
      }
      if (userId == matchDoc.data()!.joinuid) {
        await upWinAmount(matchDoc, true, true);
      }
      response.send(true);
    } else {
      response.send(false);
    }
  } catch (e) {
    console.log("--- error forfeting player player");
    console.error(Error(e));
    response.status(500).send("Error forfeiting player");
  }
}

function isPlayer(userId: string, matchDoc: DocumentSnapshot): boolean {
  return (
    userId == matchDoc.data()!.hostuid || userId == matchDoc.data()!.joinuid
  );
}

function isOtherPlayerDone(
  firstPlayer: string,
  matchDoc: DocumentSnapshot
): boolean {
  return (
    (matchDoc.data()!.hostdone != null &&
      firstPlayer == matchDoc.data()!.joinuid) ||
    (matchDoc.data()!.joindone != null &&
      firstPlayer == matchDoc.data()!.hostuid)
  );
}

/**
 * Update match document. This change will be picked up by index.ts
 * and FCM will notify the enemy player.
 */
async function updateMatch(
  userId: string,
  matchDoc: DocumentSnapshot,
  newGf: string,
  newTarget: string,
  moves: number
) {
  userId == matchDoc.data()!.hostuid
    ? await matches.doc(matchDoc.id).update({
        hostgf: newGf,
        hosttarget: newTarget,
        hostmoves: +moves
      })
    : await matches.doc(matchDoc.id).update({
        joingf: newGf,
        jointarget: newTarget,
        joinmoves: +moves
      });
}

/**
 * If a player signals that is done with the match, update the doc.
 */
async function setPlayerDone(userId: string, matchDoc: DocumentSnapshot) {
  userId == matchDoc.data()!.hostuid
    ? await matches.doc(matchDoc.id).update({
        hostdone: true
      })
    : await matches.doc(matchDoc.id).update({
        joindone: true
      });
}

/**
 * If both players are done, declare winner.
 */
async function declareWinner(matchDoc: DocumentSnapshot) {
  if (matchDoc.data()!.hostmoves < matchDoc.data()!.joinmoves) {
    await upWinAmount(matchDoc, true, false);
  } else if (matchDoc.data()!.hostmoves > matchDoc.data()!.joinmoves) {
    await upWinAmount(matchDoc, false, false);
  } else {
    await matches.doc(matchDoc.id).update({
      winner: "draw"
    });
    await resetMatch(matchDoc);
  }
}

/**
 * Increase winner's win count.
 */
async function upWinAmount(
  matchDoc: DocumentSnapshot,
  hostOrJoin: boolean,
  forfeitWin: boolean
) {
  const userRef: DocumentReference = await users.doc(
    hostOrJoin ? matchDoc.data()!.hostuid : matchDoc.data()!.joinuid
  );
  const user: DocumentSnapshot = await userRef.get();
  userRef.update({
    matchesWon: +user.data()!.matchesWon + 1
  });
  await matches.doc(matchDoc.id).update({
    winner: hostOrJoin ? matchDoc.data()!.hostuid : matchDoc.data()!.joinuid,
    winnername: user.data()!.username,
    forfeitwin: forfeitWin
  });
  await resetMatch(matchDoc);
}

/**
 * Frees players from finished game.
 * Copies match document to each user's user/pastmatches collection and
 * deconstes it from matches and user/activematches.
 */
async function resetMatch(matchDoc: DocumentSnapshot) {
  const hostRef: DocumentReference = await users.doc(matchDoc.data()!.hostuid);
  const joinRef: DocumentReference = await users.doc(matchDoc.data()!.joinuid);
  hostRef
    .collection("pastmatches")
    .doc(matchDoc.id)
    .set({
      matchid: matchDoc.id,
      moves: matchDoc.data()!.hostmoves,
      enemymoves: matchDoc.data()!.joinmoves,
      winner: matchDoc.data()!.winnername,
      forfeitwin: matchDoc.data()!.forfeitwin == true ? true : false,
      time: admin.firestore.Timestamp.now()
    });
  joinRef
    .collection("pastmatches")
    .doc(matchDoc.id)
    .set({
      matchid: matchDoc.id,
      moves: matchDoc.data()!.joinmoves,
      enemymoves: matchDoc.data()!.hostmoves,
      winner: matchDoc.data()!.winnername,
      forfeitwin: matchDoc.data()!.forfeitwin == true ? true : false,
      time: admin.firestore.Timestamp.now()
    });
  hostRef
    .collection("activematches")
    .doc(matchDoc.id)
    .delete();
  joinRef
    .collection("activematches")
    .doc(matchDoc.id)
    .delete();
  matches.doc(matchDoc.id).delete();
}
