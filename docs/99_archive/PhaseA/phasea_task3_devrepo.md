浠ヤ笅鏄粰姝ｅ鏍哥殑 **Phase A Task 3 寮€鍙戞姤鍛?*銆傚唴瀹硅鐩栵細

* 寮€鍙戣繃绋嬩腑瀹為檯閬囧埌鐨勯棶棰?
* 鐢ㄦ埛鍦ㄨ仈璋冮樁娈垫彁鍑虹殑闂
* 姣忎釜闂鐨勫畾浣嶄笌瑙ｅ喅鎬濊矾
* 鏈€缁堣惤鍦版柟妗?
* 灏氭湭闂悎銆侀渶鏋舵瀯瑁佸畾鐨勪簨椤癸紙鐢?`TODO` 鏍囪锛?

---

# Phase A Task 3 寮€鍙戞姤鍛?

**涓婚**锛歋tateMachine 鏈€灏忓彲杩愯鐗堝疄鐜颁笌 AnimationPlayer 闆嗘垚鑱旇皟鎬荤粨

## 1. 寮€鍙戠洰鏍囦笌绾︽潫

鏈换鍔＄洰鏍囨槸瀹炵幇 `StateMachine` 鏈€灏忓彲杩愯鐗堬紝骞舵寜褰撳墠鍙ｅ緞 `interface_v1_2.md`锛坄v1.0/v1.1` 涓哄巻鍙查樁娈碉級涓?`AnimationPlayer` 瀵规帴銆傚疄鐜板繀椤婚伒瀹堜互涓嬬‖绾︽潫锛?

* 鐘舵€佹満鍗曞悜渚濊禆鎾斁鍣紝鎾斁鍣ㄤ笉鍙嶅悜鐞嗚В鐘舵€佹満璇箟銆?
* 鎵€鏈夌姸鎬佸彉鏇村彧鑳界粡鐢?`dispatch(event)` 杩涘叆瑙勫垯灞傘€?
* 鎵€鏈夋墦鏂矾寰勫繀椤诲厛 `interrupt(oldToken)` 鍐?`play(newParams)`銆?
* `movement.arrive` 蹇呴』鍋?`requestId` 闃查檲鏃ф牎楠屻€?
* `hungry` 鍦ㄥ綋鍓嶈璁′腑涓嶆槸鐙珛涓荤姸鎬侊紝鑰屾槸姝ｄ氦鐨?overlay/flag銆傞」鐩枃妗ｆ槑纭啓涓衡€滃綋鍓嶇姸鎬?= 鐢熷懡鍛ㄦ湡鐘舵€?脳 涓昏涓虹姸鎬?脳 杩愬姩鐘舵€?(+ hungry overlay)鈥濄€?

---

## 2. 鍒濈増瀹炵幇闃舵閬囧埌鐨勯棶棰?

## 2.1 鐘舵€佹満瑙勫垯灞傜殑鏍稿績闅剧偣锛氫笁灞傜姸鎬佸苟琛岋紝浣嗘挱鏀捐矾寰勫繀椤荤嚎鎬у寲

### 闂

鏂囨。璇箟鏄笁灞傛浜ょ姸鎬佹満锛歚lifecycle 脳 major 脳 movement (+ hungry overlay)`锛屼絾 AnimationPlayer 鐨勬帴鍙ｅ彧鎺ュ彈鍗曟 `play(state + intent + variant)`銆?

杩欐剰鍛崇潃鐘舵€佹満鍐呴儴蹇呴』鎶娾€滄浜ょ姸鎬佲€濇姇褰辨垚鈥滃綋鍓嶅簲鎾斁鐨勪富鍔ㄧ敾鈥濓紝鍚屾椂淇濈暀杩愬姩灞傚拰 hungry overlay 鐨勭嫭绔嬫€с€?

### 瑙ｅ喅鎬濊矾

閲囩敤鍒嗗眰鎺у埗锛?

* `lifecycle / major / idleSub / movement / flags` 浣滀负**鐪熷疄鐘舵€?*
* `AnimationPlayer.play(...)` 鍙壙鎺?*褰撳墠涓诲姩鐢绘垨杩愬姩鍔ㄧ敾**
* hungry 涓嶈繘鍏ヤ富鍔ㄧ敾鍒囨崲锛岃€岀敱鐘舵€佹満缁?`attachCSSEffect` 鎴栧悗缁?overlay 灞傛帶鍒?-> 鏈€缁堥噰鐢∣verlay鏂规
* `movement` 閫昏緫鍙喅瀹氫綍鏃舵挱鏀?`walk.roaming` / `walk.targeted`锛屼笉鎵挎媴绐楀彛浣嶇Щ鏈韩

### 鏈€缁堟柟妗?

鐘舵€佹満鍐呴儴缁存姢瀹屾暣 `PetFullState`锛涙挱鏀惧眰濮嬬粓鍙帴鏀朵竴涓綋鍓嶄富鎾斁鐩爣锛屼笖杩愬姩涓?hungry 鍒嗙銆傝繖涓柟妗堜笌鎺ュ彛鎬诲垯涓€鑷淬€?

---

## 2.2 `idle.awake 鈫?drowsy 鈫?napping` 鑷姩娴佽浆涓紝瀹氭椂鍣ㄦ薄鏌撻闄╅珮

### 闂

`idle.timeout`銆乣timer.drowsyToNap`銆乣timer.roaming.tick` 閮芥槸鍐呴儴浜嬩欢锛屼笖瀹冧滑鏄紓姝ヨЕ鍙戠殑銆備竴鏃︾姸鎬佸垏鎹㈠悗鏃у畾鏃跺櫒鏈竻鎺夛紝浼氭妸杩熷埌浜嬩欢娲惧彂鍒版柊鐘舵€侊紝閫犳垚閾捐矾姹℃煋銆傛帴鍙ｈ嚜娴嬫竻鍗曞姝ゆ湁鏄庣‘瑕佹眰銆?

### 瑙ｅ喅鎬濊矾

灏嗕笁绫诲唴閮ㄥ畾鏃跺櫒缁熶竴鏀跺彛鍒?timer manager锛岀姸鎬佸垏鎹㈡椂鎸変笂涓嬫枃娓呯悊锛?

* 绂诲紑 `idle.awake` 鏃讹紝娓?`idle.timeout` 涓?`roaming.tick`
* 绂诲紑 `idle.drowsy` 鏃讹紝娓?`drowsyToNap`
* `destroy()` 鏃讹紝娓呭叏閮ㄥ唴閮ㄥ畾鏃跺櫒

### 鏈€缁堟柟妗?

瀹炵幇浜嗛泦涓紡 timer 绠＄悊锛涙墍鏈夌姸鎬佸垏鎹㈠厛娓呮棫瀹氭椂鍣紝鍐嶅缓绔嬫柊瀹氭椂鍣ㄣ€傝绛栫暐瀵瑰簲鎺ュ彛鑷祴瑕佹眰銆?

---

## 2.3 `napping` 鐨勭‖鎵撴柇蹇呴』缁熶竴鍏堢粡 `wake.from_nap`

### 闂

椤圭洰鏂囨。涓庢帴鍙ｇず渚嬮兘瑕佹眰锛歚idle.napping` 琚‖鎵撴柇鏃讹紝涓嶈兘鐩存帴璺冲埌鐩爣鐘舵€侊紝蹇呴』鍏堢粡杩?`wake.from_nap`銆?

### 瑙ｅ喅鎬濊矾

灏?`user.feed`銆乣reminder.due`銆乣user.exit` 鍦?`idle.napping` 涓婁笅鏂囦腑鐨勫鐞嗙粺涓€灏佽鎴愶細

1. `interrupt(oldToken)`
2. `clearCSSEffects()`
3. `play(wake.from_nap, oneshot)`
4. `onComplete` 鏍￠獙 token 鍚庡啀杩涘叆鐩爣鐘舵€?

### 鏈€缁堟柟妗?

瀹炵幇涓虹粺涓€鐨勨€渘apping 纭墦鏂叆鍙ｂ€濄€傝繖淇濊瘉浜嗘墍鏈夋繁鐫℃€佸閮ㄦ墦鏂摼璺殑涓€鑷存€с€?

---

## 2.4 `movement.arrive` 鐨勯檲鏃т簨浠堕棶棰?

### 闂

鎺ュ彛鏄庣‘瑕佹眰 `movement.arrive` 瑕佹牎楠?`requestId === currentMoveRequestId`锛屽惁鍒欎涪寮冦€傚師鍥犳槸 targeted_move 閫斾腑鍙兘琚埆鐨勪簨浠舵墦鏂紝杩熷埌鐨?arrive 浜嬩欢涓嶈兘鍐嶈瑙﹀彂 reminding銆?

### 瑙ｅ喅鎬濊矾

鐘舵€佹満鍐呴儴淇濆瓨 `currentMoveRequestId`锛涙瘡娆″惎鍔?targeted_move 閮界敓鎴愭柊鐨?requestId锛涙敹鍒?arrive 鏃跺厛姣斿锛屼笉涓€鑷寸洿鎺ヤ涪寮冦€?

### 鏈€缁堟柟妗?

瀹炵幇 requestId 闃查檲鏃ч€昏緫锛涜椤瑰湪 mock unit 鑷祴涓€氳繃銆?

---

## 3. 鑱旇皟闃舵鐢ㄦ埛鎻愬嚭鐨勯棶棰樹笌淇杩囩▼

## 3.1 楠岃瘉椤垫渶鍒濃€滃崱浣?/ 鎸夐挳娌″弽搴斺€?

### 鐜拌薄

鐢ㄦ埛棣栨鑱旇皟鏃跺弽棣堬細

* `Phase_A_task3_unit.html` 鍗″湪鈥滃姞杞戒腑鈥?
* `Phase_A_task3_demo.html` 鎸夐挳鐐瑰嚮鏃犲弽搴?

### 瀹氫綅

闂涓嶅湪鐘舵€佹満鏍稿績閫昏緫锛岃€屽湪楠岃瘉椤佃繍琛屾柟寮忥細

1. 楠岃瘉椤电洿鎺ュ湪娴忚鍣ㄩ噷 import `.ts` 婧愭枃浠讹紝娴忚鍣ㄤ笉鑳藉師鐢熸墽琛?TypeScript
2. demo 椤佃繕鐩存帴 import CSS锛岃繖鍚屾牱渚濊禆鏋勫缓鍣?
3. demo 椤靛璧勬簮璺緞鐨勭浉瀵逛綅缃啓閿欙紝`validation/` 椤甸潰涓嬪簲浣跨敤 `../assets`

### 瑙ｅ喅鎬濊矾

灏嗛獙璇侀〉鏀逛负娴忚鍣ㄥ彲鐩存帴杩愯鐨?bundle 鏂规锛屽悓鏃朵慨姝?assetRoot 璺緞銆?

### 鏈€缁堢粨鏋?

楠岃瘉椤垫仮澶嶅彲鐐瑰嚮銆佸彲鎵ц銆傝繖涓棶棰樺睘浜?*楠岃瘉澹冲眰闂**锛屼笉鏄姸鎬佹満瑙勫垯灞傞棶棰樸€?

---

## 3.2 unit 椤?1 椤规湭閫氳繃锛歚destroy()` 鍚庢畫鐣欎簨浠舵柇瑷€鍙ｅ緞杩囦弗

### 鐜拌薄

鐢ㄦ埛鍙嶉 unit 椤?8 杩?1 澶辫触锛屽け璐ラ」涓?`destroy() 鍚庢棤娈嬬暀浜嬩欢`銆?

### 瀹氫綅

鎺ュ彛瀹氫箟瑕佹眰 `destroy()` 蹇呴』娓呭畾鏃跺櫒骞朵綔搴熷綋鍓?token銆傛寜璇箟锛宍destroy()` 鏃跺厑璁稿彂鐢?*涓€娆″悓姝?interrupt 褰撳墠 token**锛岃繖鏄富鍔ㄩ攢姣佺殑缁勬垚閮ㄥ垎锛涘師楠岃瘉椤靛嵈鎶婅繖娆″悓姝?interrupt 涔熷垽鎴愬け璐ャ€?

### 瑙ｅ喅鎬濊矾

淇 unit 椤垫柇瑷€鍙ｅ緞锛?

* 鍏佽 `destroy()` 瑙﹀彂鏈€澶?1 娆″悓姝?interrupt
* 浣嗕笉鍏佽 destroy 涔嬪悗鍐嶆湁杩熷埌鐨?play / interrupt / dispatch

### 鏈€缁堢粨鏋?

璇ラ」閫氳繃銆?
杩欐槸**娴嬭瘯椤垫柇瑷€鍙ｅ緞闂**锛屼笉鏄姸鎬佹満鏈綋閫昏緫闂銆?

---

## 3.3 hungry overlay 鍙嚭鐜板鍥存贰鍏夋檿锛屾湭鐪熸鍙犲姞鍒拌鑹叉湰浣?

### 鐜拌薄

鐢ㄦ埛澶氭鎸囧嚭锛歚Hungry On` 鍚庤櫧鐒?`flags.isHungry = true`锛屼絾鍙湅鍒板鍥翠竴鍦堝厜鏅曪紝娌℃湁鏄庢樉鐨勨€滈ゥ楗垮舰鎬佲€濓紝涓庡凡鏈?hungry 绱犳潗涓嶄竴鑷淬€?

### 绗竴杞敊璇皾璇曪紙鍘嗗彶闃舵鍙ｅ緞锛?

鏈€鍒濇垜娌跨敤浜嗏€淐SS effect = 绾?CSS class鈥濈殑鐞嗚В锛屾妸 hungry 瀹炵幇鎴愶細

* 鍏夋檿
* 鍘婚ケ鍜?杞诲井缂╂斁
* 绠€鍗曚吉鍏冪礌娉淮

浣嗚繖鍙兘鍒堕€犫€滆瑙夊急鍖栨劅鈥濓紝鏃犳硶鐪熸澶嶇敤椤圭洰宸叉湁鐨?hungry 绱犳潗銆傝娈靛睘浜庡巻鍙查樁娈佃璇伙紙鎶?hungry 褰撲綔 CSS effect 鍏ュ彛锛夛紝褰撳墠鍙ｅ緞宸插湪 `interface_v1_2` 鏀跺彛涓?overlay 灞?+ `hungry.set` 浜嬩欢椹卞姩銆?

### 鐢ㄦ埛鎻愬嚭鐨勫叧閿垽鏂?

鐢ㄦ埛鎸囧嚭锛氭棦鐒跺凡鏈?hungry 绱犳潗锛屽氨涓嶅簲缁х画鐢ㄢ€滅函 CSS 鍏夋檿鈥濈‖妯℃嫙锛岃€屽簲鐪熸鎶婄礌鏉愮敤璧锋潵銆傝繖涓垽鏂槸姝ｇ‘鐨勩€?

### 淇鎬濊矾

淇濇寔璇箟涓嶅彉锛?

* hungry 浠嶇劧涓嶆槸 `MajorState`
* 浠嶇劧鏄?`flags.isHungry`
* 浠嶇劧涓?`idle/talking/reminding` 姝ｄ氦

浣嗗湪**琛ㄧ幇灞?*涓婏紝浠庘€滅函 CSS effect鈥濆崌绾т负鈥滅湡姝ｇ殑 hungry overlay 娓叉煋灞傗€濓細

* `AnimationPlayer` 鍐呭鍔犵嫭绔?overlay layer
* 璇诲彇 `assets/hungry/overlay` 鐨?spritesheet 涓?metadata
* 鎸夎祫婧愭枃妗ｅ畾涔夋挱鏀撅細

  * enter锛歚base_01 鈫?base_02`
  * loop锛歚base_02 鈫?shake_01 鈫?shake_02 鈫?weak_01 鈫?...`
  * exit锛歚recover_01`

### 鏈€缁堢粨鏋?

hungry 鎴愬姛浠ョ嫭绔嬬礌鏉愬眰鍙犲姞鍦ㄦ湰浣撲笂锛岃瑙夋晥鏋滆揪鍒伴鏈燂紱鍚屾椂娌℃湁鐮村潖涓夊眰姝ｄ氦鐘舵€佹満璁捐銆傜敤鎴峰凡纭璇ョ姸鎬佹弧鎰忋€?

### 缁撹

杩欓噷鏈€缁堥噰鐢ㄧ殑鏄細

* **閫昏緫涓?*锛歨ungry 浠嶇劧鏄?overlay/flag
* **娓叉煋涓?*锛歨ungry 涓嶅啀鏄函 CSS class锛岃€屾槸鐙珛绱犳潗鍙犲姞灞?

杩欐槸褰撳墠鏋舵瀯涓嬫洿鍚堢悊鐨勫疄鐜般€?

---

## 3.4 `talking` 鐨勯€€鍑烘満鍒朵笉闂悎

### 鐜拌薄

鐢ㄦ埛鍦ㄨ仈璋冧腑鎻愬嚭锛氬弻鍑昏繘鍏?`talking` 涔嬪悗锛屽皬浜哄紑濮嬫挱鏀捐璇濆姩鐢伙紝浣嗛櫎纭墦鏂锛屼技涔庢病鏈夋槑纭殑姝ｅ父缁撴潫璺緞銆備粠 demo 琛屼负涓婄湅锛屽畠鍍忔槸浼氫竴鐩?loop銆?

### 瀹氫綅

杩欐槸涓€涓湡瀹炵殑璁捐鐣欑櫧锛屼笉鏄崟绾疄鐜?bug銆傚師鍥犲涓嬶細

* `SupportedIntentMap['talking']` 鍦ㄥ綋鍓?`interface_v1_2` 涓粛浠呭厑璁?`loop`锛屾病鏈?`exit`銆?
* `PetEvent` 閲屾病鏈?`dialog.close` / `talking.finish` 杩欑被鏄惧紡缁撴潫浜嬩欢銆?
* 椤圭洰鏂囨。铏界劧璇?鈥渢alking 杞墦鏂?鈫?happy 鈫?idle.awake锛堝鏈潵闇€瑕侊級鈥濓紝浣嗘帴鍙ｅ苟鏈负鍏惰ˉ榻愬畬鏁寸殑閫€鍑烘満鍒躲€?

### 褰撳墠钀藉湴澶勭悊

鍦ㄥ綋鍓?Phase A 鏈€灏忕増涓紝`talking` 鐨勯€€鍑哄彧鑳戒緷璧栦簨浠舵墦鏂紝渚嬪锛?

* `user.pat`
* `user.feed`
* `reminder.due`
* `user.exit`

涔熷氨鏄锛屽畠褰撳墠鏄€滃彲琚墦鏂殑 loop鈥濓紝浣嗕笉鏄€滀細鑷劧闂悎鐨勫璇濈姸鎬佲€濄€?

### TODO(architect)

`talking` 鐨勬甯告敹鍙ｆ満鍒跺皻鏈棴鍚堬紝闇€鏋舵瀯瑁佸畾浜岄€変竴锛?

1. 澧炲姞鏄惧紡浜嬩欢锛屼緥濡?`dialog.close` 鎴?`talking.finish`
2. 涓?`talking` 澧炲姞 `exit` intent锛屽苟瀹氫箟瀵瑰簲鐭€€鍑哄姩鐢?

鍦ㄥ綋鍓嶉攣瀹氭帴鍙ｄ笅锛屾湭鎿呰嚜鎵╂帴鍙ｃ€?

---

## 4. 鍏跺畠瀹炵幇灞傞潰鐨勯棶棰樹笌澶勭悊

## 4.1 `roaming.tick` 鐨勮亴璐ｈ竟鐣?

### 闂

`interface_v1_2` 寤剁画浜嗘棭鏈熺増鏈璇ョ偣鐨勪慨姝ｏ細鏃х殑 `timer.roaming.start/stop` 缁熶竴涓?`timer.roaming.tick`锛宺oaming 鐨勫紑濮?鍋滄鍒ゆ柇灞炰簬鐘舵€佹満鍐呴儴鑱岃矗锛岃€屼笉鏄閮ㄤ簨浠惰亴璐ｃ€?

### 瑙ｅ喅鎬濊矾

鎶?`roaming.tick` 璁捐鎴愬唴閮ㄨ剦鍐蹭簨浠讹細

* 褰?`idle.awake + still` 鏃讹紝tick 鍙Е鍙?roaming 寮€濮?
* 褰?roaming 宸插紑濮嬫椂锛屽悗缁?tick 鐢ㄤ簬鍋滄/褰掍綅锛岄伩鍏嶅啀鍙戞槑鏂颁簨浠?

### 鏈€缁堟柟妗?

roaming 鐨勫惎鍋滅粺涓€鐢辩姸鎬佹満鍐呴儴鎺у埗锛岀鍚堝綋鍓?`interface_v1_2` 鍙ｅ緞銆?

---

## 4.2 `destroy()` 鐨勬敹鍙ｈ涔?

### 闂

涓嶄粎瑕佹竻瀹氭椂鍣紝杩樿璁╂挱鏀惧櫒鐨勮繜鍒板洖璋冭嚜鍔ㄥけ鏁堛€傛帴鍙ｅ姝ゆ湁鏄庢枃瑕佹眰銆?

### 瑙ｅ喅鎬濊矾

`destroy()` 缁熶竴鎵ц锛?

1. `clearAllTimers()`
2. 鑻ユ湁褰撳墠 token锛屽垯 `player.interrupt(currentToken)`
3. 娓呯┖ listeners
4. 鏍囪 machine 宸查攢姣侊紝鍚庣画 dispatch 鐩存帴鎷掔粷

### 鏈€缁堟柟妗?

閿€姣佸悗涓嶄細鍐嶆湁鏈夋晥鐨勫欢杩熺姸鎬佹薄鏌撱€?

---

## 5. 鏈€缁堝紑鍙戞柟妗堬紙纭畾閮ㄥ垎锛?

褰撳墠鏈€缁堢増閲囩敤濡備笅鏂规锛?

## 5.1 鐘舵€佹満灞?

* 浠?`PetFullState` 涓哄敮涓€鐪熷疄鐘舵€佹簮
* 瀵瑰 public surface 閿佸畾涓猴細`init / start / dispatch / getState / getSnapshot / subscribe / destroy`
* 鎵€鏈夌姸鎬佸彉鏇翠粎缁?`dispatch`锛堝惈 hungry锛歚dispatch({ type: 'hungry.set', value })`锛?

## 5.2 瀹氭椂鍣ㄥ眰

* `idle.timeout`锛氶┍鍔?`idle.awake -> idle.drowsy`
* `timer.drowsyToNap`锛氶┍鍔?`idle.drowsy -> idle.napping`
* `timer.roaming.tick`锛氶┍鍔?`idle.awake + still <-> roaming`
* 鐘舵€佸垏鎹㈢粺涓€娓呭畾鏃跺櫒

## 5.3 鎵撴柇灞?

* 鎵€鏈夋墦鏂矾寰勭粺涓€鍏?`interrupt` 鍐?`play`
* `napping` 鐨勭‖鎵撴柇缁熶竴鍏堢粡 `wake.from_nap`
* `drowsy` 鐨勮蒋鎵撴柇缁熶竴璧?`idle.drowsy exit`
* `movement.arrive` 蹇呭仛 `requestId` 鏍￠獙

## 5.4 hungry 鐨勬渶缁堟柟妗?

* 璇箟涓婁粛鏄?`flags.isHungry`
* 涓嶈繘鍏?`MajorState`
* 瑙嗚涓婃敼涓虹嫭绔嬬礌鏉?overlay layer
* 浣跨敤 `assets/hungry/overlay` 鐨?spritesheet 涓庡抚搴忥紝涓嶅啀浣跨敤绾?CSS 鍏夋檿妯℃嫙銆?

---

## 6. TODO(architect)

### TODO 1锛歚talking` 鐨勬甯搁€€鍑烘満鍒舵湭闂悎

褰撳墠 `talking` 鍙湁 `loop`锛屾病鏈?`exit intent`锛屼簨浠堕泦鍚堜腑涔熸病鏈?`dialog.close` / `talking.finish`銆?
寤鸿鏋舵瀯浜岄€変竴锛?

* 澧炲姞 talking 鐨勬樉寮忕粨鏉熶簨浠?
* 鎴栦负 talking 澧炲姞 `exit` intent

### TODO 2锛氶」鐩枃妗ｄ腑鍏充簬 `idle.drowsy exit` 鐨勬枃瀛楀彛寰勪粛娈嬬暀鏃ц〃杩?[宸蹭慨鏀筣

褰撳墠椤圭洰鏂囨。鐨勬懜澶村弽搴旇〃鏇惧啓鈥渄rowsy_exit 5 甯р€濓紝浣嗗綋鍓嶅彛寰勫凡缁熶竴涓衡€? 婧愬抚 + 鐩爣鎬侀甯ц嚜鐒惰鎺モ€濄€?
璇ョ偣涓嶅奖鍝嶅綋鍓嶄换鍔?3 閫昏緫锛屼絾寤鸿鏂囨。鍙ｅ緞缁х画鏀舵潫锛岄伩鍏嶅悗缁槄璇昏宸€?
- **澶囨敞**锛氬凡淇敼
---

## 7. 缁撹

Phase A Task 3 褰撳墠宸插畬鎴愭渶灏忓彲杩愯鐗堬紝骞朵笌 Task 2 鐨?AnimationPlayer 鎴愬姛鑱旇皟銆?
鏈疆寮€鍙戜腑鏈€涓昏鐨勯棶棰樺苟涓嶅湪鐘舵€佹満涓昏鍒欏眰锛岃€屽湪锛?

* 楠岃瘉椤佃繍琛屾柟寮?
* unit 椤垫柇瑷€鍙ｅ緞
* hungry overlay 鐨勬覆鏌撶瓥鐣ラ€夋嫨

杩欎簺闂鍧囧凡瀹氫綅骞朵慨姝ｃ€傚綋鍓嶇増鏈腑锛宍hungry` 閲囩敤鈥?*閫昏緫淇濇寔 flag锛屾覆鏌撳崌绾т负鐙珛绱犳潗 overlay**鈥濈殑鏂规锛屾槸鏈疆鏈€鍏抽敭鐨勫疄鐜版敹鏁涚偣銆?
鍓╀綑鏈€涓昏鐨勬湭闂悎鐐规槸 `talking` 鐨勬甯搁€€鍑烘満鍒讹紝寤鸿浜ょ敱姝ｅ鏍稿仛涓嬩竴杞帴鍙ｈ瀹氥€?


