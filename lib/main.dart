import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kiwi/kiwi.dart' as kiwi;
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';

import 'package:squazzle/data/data.dart';
import 'package:squazzle/domain/domain.dart';
import 'package:squazzle/presentation/presentation.dart';
import 'package:flutter/scheduler.dart' show timeDilation;

final bool isTest = false;

void main() {
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  kiwi.Container container = kiwi.Container();
  timeDilation = 3.0; // Will slow down animations by a factor of two

  // Providers
  container
      .registerSingleton<DbProvider, DbProviderImpl>((c) => DbProviderImpl());
  container.registerSingleton<ApiProvider, ApiProviderImpl>(
      (c) => ApiProviderImpl());
  container.registerSingleton<LogicProvider, LogicProviderImpl>(
      (c) => LogicProviderImpl());
  container.registerSingleton<LoginProvider, LoginProviderImpl>(
      (c) => LoginProviderImpl());
  container.registerSingleton<SharedPrefsProvider, SharedPrefsProviderImpl>(
      (c) => SharedPrefsProviderImpl(test: isTest));
  container.registerSingleton((c) => MessagingEventBus());

  // Repos
  container.registerSingleton((c) => SingleRepo(c.resolve<LogicProvider>(),
      c.resolve<DbProvider>(), c.resolve<SharedPrefsProvider>()));
  container.registerSingleton((c) => MultiRepo(
      c.resolve<ApiProvider>(),
      c.resolve<MessagingEventBus>(),
      c.resolve<LogicProvider>(),
      c.resolve<DbProvider>(),
      c.resolve<SharedPrefsProvider>()));
  container.registerSingleton((c) =>
      HomeRepo(c.resolve<LoginProvider>(), c.resolve<SharedPrefsProvider>()));

  // Blocs
  container.registerFactory((c) => SingleBloc(c.resolve<SingleRepo>()));
  container.registerFactory(
      (c) => MultiBloc(c.resolve<MultiRepo>(), c.resolve<MessagingEventBus>()));
  container.registerFactory(
      (c) => HomeBloc(c.resolve<HomeRepo>(), c.resolve<MessagingEventBus>()));

  initDb();

  runApp(App());
}

void initDb() async {
  Directory documentsDirectory = await getApplicationDocumentsDirectory();
  String path = join(documentsDirectory.path, "asset_squazzle.db");

  // Only copy if the database doesn't exist
  if (FileSystemEntity.typeSync(path) == FileSystemEntityType.notFound) {
    // Load database from asset and copy
    ByteData data = await rootBundle.load(join('assets', 'squazzle.db'));
    List<int> bytes =
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);

    // Save copied asset to documents
    await File(path).writeAsBytes(bytes);
  }
}

class App extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData.dark(),
      debugShowCheckedModeBanner: false,
      initialRoute: '/',
      routes: {
        '/': (context) => BlocProvider(
              child: HomeScreen(isTest),
              bloc: kiwi.Container().resolve<HomeBloc>(),
            ),
        '/single': (context) => BlocProvider(
              child: SingleScreen(),
              bloc: kiwi.Container().resolve<SingleBloc>(),
            ),
        '/multi': (context) => BlocProvider(
              child: MultiScreen(),
              bloc: kiwi.Container().resolve<MultiBloc>(),
            ),
      },
    );
  }
}
