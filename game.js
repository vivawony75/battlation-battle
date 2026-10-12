/**
 * 배틀레이션 (Battleration) - 메인 게임 로직 및 상태 머신
 * 지형, 부대 배치, 포격 판정, 십자 스플래시 힌트, 조명탄, 적군 AI
 * 아군 3발, 적군 3발 턴제 교대 포격 시스템
 * 대대본부 4x3 (1회 피격 시 파괴) 및 기관총 진지 3개(각 2칸) 추가
 */

class BattlerationGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);
    this.sfx = window.soundFX;

    this.cols = 30;
    this.rows = 20;

    // 게임 상태 머신
    this.phase = 'PLACEMENT'; // 'PLACEMENT' -> 'BATTLE' -> 'GAMEOVER'
    this.turn = 'PLAYER';     // 'PLAYER' | 'ENEMY'
    this.turnCount = 1;
    this.isFiringAnimation = false;

    // 턴당 고정 포격 발수: 3발씩 교대 사격
    this.salvoPerTurn = 3;

    // 지형 (산 타일 목록: {c, r})
    this.mountains = [];

    // 부대 데이터
    this.playerUnits = [];
    this.enemyUnits = [];

    // 그리드 데이터 (적군 진영 10x30, 아군 진영 10x30)
    this.enemyGrid = []; // row: 0~9, col: 0~29 -> { unit, unitLocalR, unitLocalC, isBlindSpot, revealed, isHit }
    this.playerGrid = []; // row: 10~19 (인덱스 0~9), col: 0~29 -> { unit, unitLocalR, unitLocalC, isBlindSpot, isHit }

    // 플레이어 전투 선택 타겟들
    this.selectedTargets = []; // [{c, r}]

    // 흙먼지 십자 흔적 목록
    this.splashMarkers = []; // [{c, r, hasEnemyNear}]

    // 조명탄 (Flare) 상태
    this.flareCooldown = 0;       // 현재 쿨타임 (0이면 사용 가능)
    this.enemyFlareCooldown = 0;
    this.isFlareMode = false;     // 조명탄 타겟팅 모드 여부
    this.flareRadius = 1;         // 기본 반경 1 (3x3), 고지대 시 반경 2 (5x5)
    this.flareScannedGrid = [];   // row: 0~9, col: 0~29 (boolean)

    // 부대 편성 정의: 대대본부 4x3 (1HP), 화기중대 3x2, 보병 1/2/3중대 2x2, 기관총 진지 3개 (2x1)
    this.placementUnitDefs = [
      { id: 'HQ', name: '대대본부', w: 4, h: 3, canRotate: true, baseHp: 1 },
      { id: 'MORTAR', name: '화기중대', w: 3, h: 2, canRotate: true, baseHp: 1 },
      { id: 'ALPHA', name: '1중대', w: 2, h: 2, canRotate: false, baseHp: 1 },
      { id: 'BRAVO', name: '2중대', w: 2, h: 2, canRotate: false, baseHp: 1 },
      { id: 'CHARLIE', name: '3중대', w: 2, h: 2, canRotate: false, baseHp: 1 },
      { id: 'MG1', name: '기관총 1진지', w: 2, h: 1, canRotate: true, baseHp: 1 },
      { id: 'MG2', name: '기관총 2진지', w: 2, h: 1, canRotate: true, baseHp: 1 },
      { id: 'MG3', name: '기관총 3진지', w: 2, h: 1, canRotate: true, baseHp: 1 },
    ];
    this.selectedUnitToPlace = null;
    this.placedUnitIds = new Set();

    // AI 추리 메모리
    this.aiHuntQueue = [];
    this.aiSuspectQueue = [];
    this.aiRevealedTiles = new Set();

    // 통계 기록
    this.stats = {
      playerShots: 0,
      playerHits: 0,
      enemyShots: 0,
      enemyHits: 0,
      playerKills: 0,
      enemyKills: 0
    };

    // 초기화
    this.initGrids();
    this.generateMountains();
    this.bindEvents();
    this.selectUnitForPlacement(0);

    // 렌더링 루프 가동
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    this.log('작전 참모: 배틀레이션 전장 가동. 대대본부(4x3), 화기중대, 1~3중대, 기관총 3개 진지를 배치하십시오.', 'system');
  }

  // 그리드 초기화
  initGrids() {
    this.enemyGrid = [];
    for (let r = 0; r < 10; r++) {
      this.enemyGrid[r] = [];
      this.flareScannedGrid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.enemyGrid[r][c] = {
          unit: null,
          unitLocalR: 0,
          unitLocalC: 0,
          isBlindSpot: false,
          revealed: false,
          isHit: false
        };
        this.flareScannedGrid[r][c] = false;
      }
    }

    this.playerGrid = [];
    for (let r = 10; r < 20; r++) {
      const idx = r - 10;
      this.playerGrid[idx] = [];
      for (let c = 0; c < this.cols; c++) {
        this.playerGrid[idx][c] = {
          unit: null,
          unitLocalR: 0,
          unitLocalC: 0,
          isBlindSpot: false,
          isHit: false
        };
      }
    }
  }

  // 산 지형 생성
  generateMountains() {
    this.mountains = [];

    // 적군 산맥 (y: 3~6)
    const enemyPeaks = [
      { c: 6, r: 4 },
      { c: 15, r: 3 },
      { c: 23, r: 5 }
    ];

    // 아군 산맥 (y: 13~16)
    const playerPeaks = [
      { c: 7, r: 15 },
      { c: 16, r: 16 },
      { c: 24, r: 14 }
    ];

    [...enemyPeaks, ...playerPeaks].forEach(p => {
      this.mountains.push({ c: p.c, r: p.r });
      const offsets = [
        { dc: 1, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 0, dr: (p.r < 10 ? -1 : 1) },
        { dc: 1, dr: (p.r < 10 ? -1 : 1) }
      ];
      offsets.forEach(off => {
        const nc = p.c + off.dc;
        const nr = p.r + off.dr;
        if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
          if (!this.mountains.some(m => m.c === nc && m.r === nr)) {
            this.mountains.push({ c: nc, r: nr });
          }
        }
      });
    });
  }

  isMountain(col, row) {
    return this.mountains.some(m => m.c === col && m.r === row);
  }

  checkBlindSpot(col, row, isEnemy) {
    if (isEnemy) {
      return this.isMountain(col, row + 1);
    } else {
      return this.isMountain(col, row - 1);
    }
  }

  checkHighGround(col, row, w, h) {
    for (let r = row - 1; r <= row + h; r++) {
      for (let c = col - 1; c <= col + w; c++) {
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
          if (this.isMountain(c, r)) return true;
        }
      }
    }
    return false;
  }

  // ---------------- 부대 배치 로직 ----------------

  selectUnitForPlacement(index) {
    if (index < 0 || index >= this.placementUnitDefs.length) return;
    const def = this.placementUnitDefs[index];
    this.selectedUnitToPlace = {
      ...def,
      currentW: def.w,
      currentH: def.h,
      isRotated: false
    };
    this.updatePlacementUI();
  }

  rotatePlacementUnit() {
    if (!this.selectedUnitToPlace || !this.selectedUnitToPlace.canRotate) return;
    const temp = this.selectedUnitToPlace.currentW;
    this.selectedUnitToPlace.currentW = this.selectedUnitToPlace.currentH;
    this.selectedUnitToPlace.currentH = temp;
    this.selectedUnitToPlace.isRotated = !this.selectedUnitToPlace.isRotated;
    this.sfx.playBeep(450);
    this.updatePlacementUI();
  }

  isValidPlacement(col, row, w, h, forEnemy = false) {
    const minR = forEnemy ? 0 : 10;
    const maxR = forEnemy ? 9 : 19;

    if (col < 0 || col + w > this.cols) return false;
    if (row < minR || row + h > maxR + 1) return false;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const gc = col + c;
        const gr = row + r;
        if (this.isMountain(gc, gr)) return false;

        if (forEnemy) {
          if (this.enemyGrid[gr][gc].unit) return false;
        } else {
          if (this.playerGrid[gr - 10][gc].unit) return false;
        }
      }
    }
    return true;
  }

  placePlayerUnit(col, row) {
    if (!this.selectedUnitToPlace) return false;
    const def = this.selectedUnitToPlace;
    const w = def.currentW;
    const h = def.currentH;

    if (!this.isValidPlacement(col, row, w, h, false)) {
      this.sfx.playBeep(250);
      return false;
    }

    this.removePlayerUnit(def.id);

    const cells = [];
    const blindSpotCells = [];
    for (let r = 0; r < h; r++) {
      cells[r] = [];
      blindSpotCells[r] = [];
      for (let c = 0; c < w; c++) {
        cells[r][c] = def.baseHp; // 1회 피격으로 파괴 (1HP)
        const gc = col + c;
        const gr = row + r;
        const isBlind = this.checkBlindSpot(gc, gr, false);
        blindSpotCells[r][c] = isBlind;
      }
    }

    const hasHigh = this.checkHighGround(col, row, w, h);

    const unit = {
      id: def.id,
      name: def.name,
      type: def.id,
      col, row,
      width: w,
      height: h,
      cells,
      blindSpotCells,
      hasHighGround: hasHigh,
      isDestroyed: false,
      maxHpTotal: w * h * def.baseHp
    };

    this.playerUnits.push(unit);
    this.placedUnitIds.add(def.id);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const gc = col + c;
        const gr = row + r;
        this.playerGrid[gr - 10][gc] = {
          unit,
          unitLocalR: r,
          unitLocalC: c,
          isBlindSpot: blindSpotCells[r][c],
          isHit: false
        };
      }
    }

    this.sfx.playBeep(650);

    const nextIdx = this.placementUnitDefs.findIndex(d => !this.placedUnitIds.has(d.id));
    if (nextIdx !== -1) {
      this.selectUnitForPlacement(nextIdx);
    } else {
      this.selectedUnitToPlace = null;
    }

    this.updatePlacementUI();
    this.updateUnitStatusCards();
    return true;
  }

  removePlayerUnit(unitId) {
    const idx = this.playerUnits.findIndex(u => u.id === unitId);
    if (idx !== -1) {
      const u = this.playerUnits[idx];
      for (let r = 0; r < u.height; r++) {
        for (let c = 0; c < u.width; c++) {
          const gc = u.col + c;
          const gr = u.row + r;
          this.playerGrid[gr - 10][gc] = {
            unit: null,
            unitLocalR: 0,
            unitLocalC: 0,
            isBlindSpot: false,
            isHit: false
          };
        }
      }
      this.playerUnits.splice(idx, 1);
      this.placedUnitIds.delete(unitId);
    }
  }

  autoPlaceUnits(isEnemy = false) {
    if (isEnemy) {
      this.enemyUnits = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.enemyGrid[r][c] = {
            unit: null,
            unitLocalR: 0,
            unitLocalC: 0,
            isBlindSpot: false,
            revealed: false,
            isHit: false
          };
        }
      }
    } else {
      this.playerUnits = [];
      this.placedUnitIds.clear();
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.playerGrid[r][c] = {
            unit: null,
            unitLocalR: 0,
            unitLocalC: 0,
            isBlindSpot: false,
            isHit: false
          };
        }
      }
    }

    const minR = isEnemy ? 0 : 10;
    const maxR = isEnemy ? 9 : 19;

    this.placementUnitDefs.forEach(def => {
      let placed = false;
      let tries = 0;

      while (!placed && tries < 500) {
        tries++;
        let w = def.w;
        let h = def.h;
        if (def.canRotate && Math.random() > 0.5) {
          w = def.h;
          h = def.w;
        }

        const col = Math.floor(Math.random() * (this.cols - w + 1));
        const row = minR + Math.floor(Math.random() * (maxR - minR - h + 2));

        if (this.isValidPlacement(col, row, w, h, isEnemy)) {
          const cells = [];
          const blindSpotCells = [];
          for (let r = 0; r < h; r++) {
            cells[r] = [];
            blindSpotCells[r] = [];
            for (let c = 0; c < w; c++) {
              cells[r][c] = def.baseHp;
              const gc = col + c;
              const gr = row + r;
              const isBlind = this.checkBlindSpot(gc, gr, isEnemy);
              blindSpotCells[r][c] = isBlind;
            }
          }

          const hasHigh = this.checkHighGround(col, row, w, h);

          const unit = {
            id: def.id,
            name: def.name,
            type: def.id,
            col, row,
            width: w,
            height: h,
            cells,
            blindSpotCells,
            hasHighGround: hasHigh,
            isDestroyed: false,
            maxHpTotal: w * h * def.baseHp
          };

          if (isEnemy) {
            this.enemyUnits.push(unit);
          } else {
            this.playerUnits.push(unit);
            this.placedUnitIds.add(def.id);
          }

          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              const gc = col + c;
              const gr = row + r;
              if (isEnemy) {
                this.enemyGrid[gr][gc] = {
                  unit,
                  unitLocalR: r,
                  unitLocalC: c,
                  isBlindSpot: blindSpotCells[r][c],
                  revealed: false,
                  isHit: false
                };
              } else {
                this.playerGrid[gr - 10][gc] = {
                  unit,
                  unitLocalR: r,
                  unitLocalC: c,
                  isBlindSpot: blindSpotCells[r][c],
                  isHit: false
                };
              }
            }
          }

          placed = true;
        }
      }
    });

    if (!isEnemy) {
      this.selectedUnitToPlace = null;
      this.updatePlacementUI();
      this.updateUnitStatusCards();
      this.sfx.playBeep(520);
    }
  }

  // 전투 개시
  startBattle() {
    if (this.playerUnits.length < this.placementUnitDefs.length) {
      alert(`모든 부대(${this.placementUnitDefs.length}개)를 배치해야 전투를 시작할 수 있습니다.`);
      return;
    }

    this.autoPlaceUnits(true);

    this.phase = 'BATTLE';
    this.turn = 'PLAYER';
    this.turnCount = 1;
    this.flareCooldown = 0;
    this.enemyFlareCooldown = 0;
    this.isFiringAnimation = false;
    this.selectedTargets = [];

    this.checkPlayerHighGroundBonus();

    this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
    this.log(`[작전 개시] 턴 ${this.turnCount}: 아군 턴입니다. 적 진영에 3발의 포격 좌표를 지정하십시오!`, 'system');
    this.sfx.playBeep(700);

    document.getElementById('placementToolbar').style.display = 'none';
    document.getElementById('battleControls').style.display = 'flex';
    document.getElementById('turnBadge').className = 'turn-pill player';
    document.getElementById('turnBadge').textContent = '아군 턴 (PLAYER)';
    document.getElementById('turnCountVal').textContent = this.turnCount;

    const subHelp = document.getElementById('subHelpText');
    if (subHelp) subHelp.textContent = '적 진영(상단)에 포격 좌표 3곳을 클릭하여 지정 후 [포격 개시]를 누르세요.';

    this.updateBattleUI();
    this.updateUnitStatusCards();
  }

  checkPlayerHighGroundBonus() {
    const companies = this.playerUnits.filter(u => ['ALPHA', 'BRAVO', 'CHARLIE'].includes(u.type) && !u.isDestroyed);
    const hasHigh = companies.some(u => u.hasHighGround);
    this.flareRadius = hasHigh ? 2 : 1;
  }

  // ---------------- 사격 및 전투 메커니즘 ----------------

  // ---------------- 사격 및 단계별 포격 제한 메커니즘 ----------------

  /**
   * 부대 생존 상태에 따른 발사 가능 수량 및 발사 주체 계산:
   * - 기본 (대대본부 & 화기중대 생존): 3발 사격
   * - 대대본부 완파 시: 화기중대에서 2발 제한 발사
   * - 화기중대 완파 시: 대대본부에서 2발 제한 발사
   * - 대대본부, 화기중대 둘 다 완파 시: 각 중대에서 1발 제한 발사
   * - 모든 중대 완파 시: 기관총 진지 1발 발사
   * - 위 조건이 실행되지 않는 경우 (모든 부대 전멸): 0발 (게임 종료)
   */
  getSalvoInfo(isEnemy = false) {
    const units = isEnemy ? this.enemyUnits : this.playerUnits;

    const hq = units.find(u => u.type === 'HQ');
    const mortar = units.find(u => u.type === 'MORTAR');
    const hqAlive = hq && !hq.isDestroyed;
    const mortarAlive = mortar && !mortar.isDestroyed;

    const companies = units.filter(u => ['ALPHA', 'BRAVO', 'CHARLIE'].includes(u.type));
    const aliveCompanies = companies.filter(u => !u.isDestroyed);

    const mgNests = units.filter(u => u.type.startsWith('MG'));
    const aliveMgNests = mgNests.filter(u => !u.isDestroyed);

    // 1. 대대본부 & 화기중대 정상 합동 포격 (3발)
    if (hqAlive && mortarAlive) {
      return {
        count: 3,
        originUnit: mortar,
        desc: '대대본부 & 화기중대 정상 합동 포격 (3발)'
      };
    }

    // 2. 대대본부 완파 시 -> 화기중대에서 2발 제한 발사
    if (!hqAlive && mortarAlive) {
      return {
        count: 2,
        originUnit: mortar,
        desc: '대대본부 완파! 화기중대 단독 사격 (2발 제한)'
      };
    }

    // 3. 화기중대 완파 시 -> 대대본부에서 2발 제한 발사
    if (hqAlive && !mortarAlive) {
      return {
        count: 2,
        originUnit: hq,
        desc: '화기중대 완파! 대대본부 긴급 예비 포격 (2발 제한)'
      };
    }

    // 4. 대대본부, 화기중대 둘 다 완파 시 -> 잔존 보병 중대에서 1발 제한 발사
    if (!hqAlive && !mortarAlive && aliveCompanies.length > 0) {
      return {
        count: 1,
        originUnit: aliveCompanies[0],
        desc: `사령부/화기 전멸! 잔존 ${aliveCompanies[0].name} 결사항전 (1발 제한)`
      };
    }

    // 5. 모든 중대 완파 시 -> 잔존 기관총 진지에서 1발 발사
    if (!hqAlive && !mortarAlive && aliveCompanies.length === 0 && aliveMgNests.length > 0) {
      return {
        count: 1,
        originUnit: aliveMgNests[0],
        desc: `보병중대 전멸! 최후의 ${aliveMgNests[0].name} 사격 (1발)`
      };
    }

    // 6. 위 조건이 실행되지 않는 경우 -> 0발 (게임 종료 조건)
    return {
      count: 0,
      originUnit: null,
      desc: '포격 능력 완전 상실 (전멸)'
    };
  }

  getSalvoCapacity(isEnemy = false) {
    return this.getSalvoInfo(isEnemy).count;
  }

  handleTargetClick(col, row) {
    if (this.phase !== 'BATTLE' || this.turn !== 'PLAYER' || this.isFiringAnimation) return;
    if (row >= 10) return;

    if (this.isFlareMode) {
      this.executeFlareScan(col, row);
      return;
    }

    if (this.enemyGrid[row][col].revealed) {
      this.sfx.playBeep(220);
      return;
    }

    const existingIdx = this.selectedTargets.findIndex(t => t.c === col && t.r === row);
    if (existingIdx !== -1) {
      this.selectedTargets.splice(existingIdx, 1);
      this.sfx.playBeep(350);
      this.updateBattleUI();
      return;
    }

    const maxSalvo = this.getSalvoInfo(false).count;
    if (this.selectedTargets.length >= maxSalvo) {
      this.sfx.playBeep(250);
      return;
    }

    this.selectedTargets.push({ c: col, r: row });
    this.sfx.playBeep(580 + this.selectedTargets.length * 60);
    this.updateBattleUI();
  }

  toggleFlareMode() {
    if (this.phase !== 'BATTLE' || this.turn !== 'PLAYER' || this.isFiringAnimation) return;

    if (this.flareCooldown > 0) {
      alert(`조명탄 재사용 대기 중입니다. (남은 쿨타임: ${this.flareCooldown}턴)`);
      return;
    }
    const hasCompany = this.playerUnits.some(u => ['ALPHA', 'BRAVO', 'CHARLIE'].includes(u.type) && !u.isDestroyed);
    if (!hasCompany) {
      alert('조명탄을 발사할 일반 중대(1/2/3중대)가 모두 전멸하여 사용할 수 없습니다.');
      return;
    }

    this.isFlareMode = !this.isFlareMode;
    const btn = document.getElementById('btnFlare');
    if (this.isFlareMode) {
      btn.classList.add('active-mode');
      this.log('조명탄 발사 준비 완료: 적 진영을 클릭하여 목표 구역을 정찰하십시오.', 'system');
    } else {
      btn.classList.remove('active-mode');
    }
  }

  executeFlareScan(centerCol, centerRow) {
    this.isFlareMode = false;
    document.getElementById('btnFlare').classList.remove('active-mode');

    const aliveCompanies = this.playerUnits.filter(u => ['ALPHA', 'BRAVO', 'CHARLIE'].includes(u.type) && !u.isDestroyed).length;
    if (aliveCompanies === 3) this.flareCooldown = 3;
    else if (aliveCompanies === 2) this.flareCooldown = 4;
    else if (aliveCompanies === 1) this.flareCooldown = 5;
    else this.flareCooldown = 999;

    this.checkPlayerHighGroundBonus();
    const rad = this.flareRadius;

    this.sfx.playFlare();
    this.renderer.addFlare(centerCol, centerRow, rad);

    let detectedCount = 0;
    const startC = Math.max(0, centerCol - rad);
    const endC = Math.min(this.cols - 1, centerCol + rad);
    const startR = Math.max(0, centerRow - rad);
    const endR = Math.min(9, centerRow + rad);

    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        this.flareScannedGrid[r][c] = true;
        if (this.enemyGrid[r][c].unit && !this.enemyGrid[r][c].isHit) {
          detectedCount++;
        }
      }
    }

    const rangeStr = rad === 2 ? '5x5 (고지대 관측 보너스)' : '3x3';
    if (detectedCount > 0) {
      this.log(`[조명탄 정찰] ${rangeStr} 구역 스캔 완료! 적 유닛 반응 ${detectedCount}개소 포착!`, 'hit');
      this.showToast(`[조명탄 스캔] 적 반응 ${detectedCount}개소 포착!`);
    } else {
      this.log(`[조명탄 정찰] ${rangeStr} 구역 스캔 완료. 적 유닛 반응 없음.`, 'player-action');
      this.showToast(`[조명탄 스캔] 적 반응 없음`);
    }

    this.updateBattleUI();
  }

  clearTargets() {
    if (this.isFiringAnimation || this.turn !== 'PLAYER') return;
    this.selectedTargets = [];
    this.sfx.playBeep(300);
    this.updateBattleUI();
  }

  firePlayerSalvo() {
    if (this.selectedTargets.length === 0 || this.isFiringAnimation || this.turn !== 'PLAYER') return;

    this.isFiringAnimation = true;
    document.getElementById('btnFire').disabled = true;

    const salvoInfo = this.getSalvoInfo(false);
    const originUnit = salvoInfo.originUnit || this.playerUnits[0];
    const weaponType = (originUnit && originUnit.type && originUnit.type.startsWith('MG')) ? 'MG' : '81MM';
    const startX = this.renderer.offsetX + (originUnit ? originUnit.col * this.renderer.cellSize + 20 : 400);
    const startY = this.renderer.offsetY + (originUnit ? originUnit.row * this.renderer.cellSize + 20 : 450);

    const targets = [...this.selectedTargets];
    this.selectedTargets = [];
    this.updateBattleUI();

    let completedShots = 0;

    targets.forEach((t, idx) => {
      setTimeout(() => {
        const cell = this.enemyGrid[t.r][t.c];
        const isHitTarget = cell.unit !== null;
        let isBlindSpot = false;

        if (isHitTarget && cell.isBlindSpot) {
          // 승률 7:3 밸런스: 아군 포격의 적 사각지대 돌파율 70% (적 도탄 방어 확률 30%)
          if (Math.random() < 0.3) {
            isBlindSpot = true;
          }
        }

        if (weaponType !== 'MG') {
          this.sfx.playLaunch();
          this.sfx.playWhistle();
        }

        this.renderer.addProjectile(
          startX + (idx * 8),
          startY,
          t.c,
          t.r,
          isHitTarget && !isBlindSpot,
          isBlindSpot,
          cell.unit ? cell.unit.name : null,
          () => {
            this.handlePlayerImpact(t.c, t.r, isBlindSpot);
            completedShots++;

            if (completedShots === targets.length) {
              setTimeout(() => {
                this.isFiringAnimation = false;
                this.checkGameEndOrNextTurn();
              }, 700);
            }
          },
          weaponType
        );
      }, idx * (weaponType === 'MG' ? 650 : 300));
    });
  }

  handlePlayerImpact(col, row, isBlindSpot) {
    const cell = this.enemyGrid[row][col];
    cell.revealed = true;
    this.stats.playerShots++;

    if (isBlindSpot) {
      this.sfx.playDeflect();
      this.log(`[도탄!] (${col + 1}, ${String.fromCharCode(65 + row)}): 산맥 후방 사각지대! 포탄이 암벽에 도탄되었습니다.`, 'player-action');
    } else if (cell.unit) {
      cell.isHit = true;
      this.stats.playerHits++;
      this.sfx.playHit();

      const unit = cell.unit;
      const lr = cell.unitLocalR;
      const lc = cell.unitLocalC;
      unit.cells[lr][lc]--; // 1회 피격으로 즉시 파괴

      if (unit.type === 'HQ') {
        this.log(`[명중!] (${col + 1}, ${String.fromCharCode(65 + row)}): 적 대대본부 구획 피격 파괴!`, 'hit');
      } else {
        this.log(`[명중!] (${col + 1}, ${String.fromCharCode(65 + row)}): 적 [${unit.name}] 피격 파괴!`, 'hit');
      }

      this.checkUnitDestroyed(unit, true);
    } else {
      this.sfx.playMiss();
      this.log(`[공터] (${col + 1}, ${String.fromCharCode(65 + row)}): 빗나감 (공터 명중)`, 'player-action');
    }

    this.createSplashTrace(col, row, true);
    this.updateUnitStatusCards();
  }

  createSplashTrace(col, row, isPlayerAttack) {
    const crossOffsets = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];

    let nearEnemyDetected = false;

    crossOffsets.forEach(off => {
      const nc = col + off.dc;
      const nr = row + off.dr;

      if (isPlayerAttack) {
        if (nc >= 0 && nc < this.cols && nr >= 0 && nr < 10) {
          const neighbor = this.enemyGrid[nr][nc];
          let hasEnemy = false;
          if (neighbor.unit && !neighbor.unit.isDestroyed) {
            hasEnemy = true;
            nearEnemyDetected = true;
          }

          const exist = this.splashMarkers.find(m => m.c === nc && m.r === nr);
          if (!exist) {
            this.splashMarkers.push({ c: nc, r: nr, hasEnemyNear: hasEnemy });
          } else if (hasEnemy) {
            exist.hasEnemyNear = true;
          }
        }
      } else {
        if (nc >= 0 && nc < this.cols && nr >= 10 && nr < 20) {
          const neighbor = this.playerGrid[nr - 10][nc];
          if (neighbor.unit && !neighbor.unit.isDestroyed) {
            this.aiSuspectQueue.push({ c: nc, r: nr });
          }
        }
      }
    });

    if (isPlayerAttack && nearEnemyDetected) {
      this.log(`[정찰 힌트] 낙탄 지점 주변 십자 흙먼지 속에서 적 부대 반응이 감지되었습니다!`, 'hit');
    }
  }

  checkUnitDestroyed(unit, isEnemyUnit) {
    if (unit.isDestroyed) return;

    let totalHp = 0;
    for (let r = 0; r < unit.height; r++) {
      for (let c = 0; c < unit.width; c++) {
        totalHp += unit.cells[r][c];
      }
    }

    if (totalHp === 0) {
      unit.isDestroyed = true;
      this.sfx.playUnitDestroyed();

      const nextSalvo = this.getSalvoInfo(isEnemyUnit);

      if (isEnemyUnit) {
        this.stats.playerKills++;
        this.log(`★★★ [전과 확인] 적 [${unit.name}] 완파되었습니다! ★★★`, 'kill');
        this.showToast(`[적 ${unit.name} 완파!]`);

        if (nextSalvo.count > 0) {
          this.log(`[적 전력 변화] 적군 포격 제한: ${nextSalvo.desc}`, 'system');
        }
      } else {
        this.stats.enemyKills++;
        this.log(`▲▲▲ [경보] 아군 [${unit.name}] 완파되었습니다! ▲▲▲`, 'enemy-action');
        this.showToast(`[아군 ${unit.name} 완파!]`);

        if (nextSalvo.count > 0) {
          this.log(`[아군 전력 변화] 아군 긴급 발사 모드 전환: ${nextSalvo.desc}`, 'system');
        }
      }
    }
  }

  checkGameEndOrNextTurn() {
    const enemySalvo = this.getSalvoInfo(true);
    const playerSalvo = this.getSalvoInfo(false);

    // [조건 5] 위 조건이 실행되지 않는 경우 (모든 저항 부대 전멸) -> 게임 종료!
    if (enemySalvo.count === 0) {
      this.log('★☆★ [작전 대성공] 적군의 모든 저항 부대 완파! 적 포격 능력 완전 상실로 최종 승리! ★☆★', 'kill');
      this.triggerGameOver(true);
      return;
    }

    if (playerSalvo.count === 0) {
      this.log('▲▼▲ [작전 실패] 아군의 모든 전투 부대 완파. 포격 능력 완전 상실로 최종 패배. ▲▼▲', 'enemy-action');
      this.triggerGameOver(false);
      return;
    }

    // 턴 교대
    if (this.turn === 'PLAYER') {
      this.turn = 'ENEMY';
      document.getElementById('turnBadge').className = 'turn-pill enemy';
      document.getElementById('turnBadge').textContent = '적군 턴 (ENEMY)';
      this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
      this.log(`[적군 포격 경보] ${enemySalvo.desc}! 적 포탄 ${enemySalvo.count}발이 날아옵니다!`, 'enemy-action');

      const subHelp = document.getElementById('subHelpText');
      if (subHelp) subHelp.textContent = `적군이 포격(${enemySalvo.count}발)을 가하고 있습니다... 잠시 대기하십시오.`;

      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.flareScannedGrid[r][c] = false;
        }
      }

      this.updateBattleUI();

      setTimeout(() => {
        this.executeEnemyTurn();
      }, 1000);
    } else {
      this.turn = 'PLAYER';
      this.turnCount++;
      document.getElementById('turnCountVal').textContent = this.turnCount;
      document.getElementById('turnBadge').className = 'turn-pill player';
      document.getElementById('turnBadge').textContent = '아군 턴 (PLAYER)';

      if (this.flareCooldown > 0) this.flareCooldown--;
      if (this.enemyFlareCooldown > 0) this.enemyFlareCooldown--;

      this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
      this.log(`[아군 턴] 턴 ${this.turnCount}: ${playerSalvo.desc}! ${playerSalvo.count}곳의 포격 좌표를 지정하십시오.`, 'system');

      const subHelp = document.getElementById('subHelpText');
      if (subHelp) subHelp.textContent = `적 진영(상단)에 포격 좌표 ${playerSalvo.count}곳을 지정 후 [포격 개시]를 누르세요. (${playerSalvo.desc})`;

      this.updateBattleUI();
      this.updateUnitStatusCards();
    }
  }

  // ---------------- 스마트 적군 AI 알고리즘 ----------------

  executeEnemyTurn() {
    this.isFiringAnimation = true;

    if (this.enemyFlareCooldown <= 0 && Math.random() < 0.35) {
      const fc = Math.floor(Math.random() * this.cols);
      const fr = 10 + Math.floor(Math.random() * 10);
      this.enemyFlareCooldown = 4;
      this.sfx.playFlare();
      this.renderer.addFlare(fc, fr, 1);
      this.log(`[적 조명탄 포착] 적군이 아군 진영 (${fc + 1}, ${String.fromCharCode(65 + fr)}) 상공에 조명탄을 투하했습니다!`, 'enemy-action');
    }

    const enemySalvo = this.getSalvoInfo(true);
    const salvoCount = enemySalvo.count;

    if (salvoCount === 0) {
      this.isFiringAnimation = false;
      this.checkGameEndOrNextTurn();
      return;
    }

    const targets = this.pickAITargets(salvoCount);

    if (targets.length === 0) {
      this.isFiringAnimation = false;
      this.checkGameEndOrNextTurn();
      return;
    }

    const originUnit = enemySalvo.originUnit || this.enemyUnits[0];
    const weaponType = (originUnit && originUnit.type && originUnit.type.startsWith('MG')) ? 'MG' : '81MM';
    const startX = this.renderer.offsetX + (originUnit ? originUnit.col * this.renderer.cellSize + 20 : 400);
    const startY = this.renderer.offsetY + (originUnit ? originUnit.row * this.renderer.cellSize + 10 : 80);

    let completedShots = 0;

    targets.forEach((t, idx) => {
      setTimeout(() => {
        const cell = this.playerGrid[t.r - 10][t.c];
        const isHitTarget = cell.unit !== null;
        let isBlindSpot = false;

        if (isHitTarget && cell.isBlindSpot) {
          // 승률 7:3 밸런스: 아군 사각지대 방어율 70% (적 포탄 도탄 방어 성공)
          if (Math.random() < 0.7) {
            isBlindSpot = true;
          }
        }

        if (weaponType !== 'MG') {
          this.sfx.playLaunch();
          this.sfx.playWhistle();
        }

        this.renderer.addProjectile(
          startX + (idx * 8),
          startY,
          t.c,
          t.r,
          isHitTarget && !isBlindSpot,
          isBlindSpot,
          cell.unit ? cell.unit.name : null,
          () => {
            this.handleEnemyImpact(t.c, t.r, isBlindSpot);
            completedShots++;

            if (completedShots === targets.length) {
              setTimeout(() => {
                this.isFiringAnimation = false;
                this.checkGameEndOrNextTurn();
              }, 700);
            }
          },
          weaponType
        );
      }, idx * (weaponType === 'MG' ? 650 : 350));
    });
  }

  pickAITargets(count) {
    const targets = [];
    const chosenKeys = new Set();

    while (targets.length < count) {
      let candidate = null;

      while (this.aiHuntQueue.length > 0) {
        const pt = this.aiHuntQueue.shift();
        const key = `${pt.c},${pt.r}`;
        if (pt.c >= 0 && pt.c < this.cols && pt.r >= 10 && pt.r < 20) {
          const isHitAlready = this.playerGrid[pt.r - 10][pt.c].isHit;
          if (!isHitAlready && !chosenKeys.has(key)) {
            candidate = pt;
            break;
          }
        }
      }

      if (!candidate) {
        while (this.aiSuspectQueue.length > 0) {
          const pt = this.aiSuspectQueue.shift();
          const key = `${pt.c},${pt.r}`;
          if (pt.c >= 0 && pt.c < this.cols && pt.r >= 10 && pt.r < 20) {
            const isHitAlready = this.playerGrid[pt.r - 10][pt.c].isHit;
            if (!isHitAlready && !chosenKeys.has(key)) {
              candidate = pt;
              break;
            }
          }
        }
      }

      if (!candidate) {
        let tries = 0;
        while (tries < 150) {
          tries++;
          const c = Math.floor(Math.random() * this.cols);
          const r = 10 + Math.floor(Math.random() * 10);
          const key = `${c},${r}`;
          if ((c + r) % 2 === 0 && !this.playerGrid[r - 10][c].isHit && !chosenKeys.has(key)) {
            candidate = { c, r };
            break;
          }
        }
      }

      if (!candidate) {
        const unhitTiles = [];
        for (let r = 10; r < 20; r++) {
          for (let c = 0; c < this.cols; c++) {
            const key = `${c},${r}`;
            if (!this.playerGrid[r - 10][c].isHit && !chosenKeys.has(key)) {
              unhitTiles.push({ c, r });
            }
          }
        }

        if (unhitTiles.length > 0) {
          const pick = unhitTiles[Math.floor(Math.random() * unhitTiles.length)];
          candidate = pick;
        } else {
          break;
        }
      }

      if (candidate) {
        const key = `${candidate.c},${candidate.r}`;
        chosenKeys.add(key);
        targets.push(candidate);
      }
    }

    return targets;
  }

  handleEnemyImpact(col, row, isBlindSpot) {
    const cell = this.playerGrid[row - 10][col];
    cell.isHit = true;
    this.stats.enemyShots++;

    if (isBlindSpot) {
      this.sfx.playDeflect();
      this.log(`[사각지대 방어!] (${col + 1}, ${String.fromCharCode(65 + row)}): 산맥 차폐로 적 포탄이 도탄되었습니다! 피해 없음.`, 'player-action');
    } else if (cell.unit) {
      this.stats.enemyHits++;
      this.sfx.playHit();

      const unit = cell.unit;
      const lr = cell.unitLocalR;
      const lc = cell.unitLocalC;
      unit.cells[lr][lc]--; // 1회 피격으로 즉시 파괴

      this.log(`[피격 경보!] (${col + 1}, ${String.fromCharCode(65 + row)}): 아군 [${unit.name}] 피격 파괴!`, 'enemy-action');

      // 승률 7:3 밸런싱: 60% 확률로 즉시 사냥 큐에 등록, 40%는 전선 분산 탐색
      if (Math.random() < 0.6) {
        const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
        dirs.forEach(d => {
          const nc = col + d.dc;
          const nr = row + d.dr;
          if (nc >= 0 && nc < this.cols && nr >= 10 && nr < 20) {
            this.aiHuntQueue.push({ c: nc, r: nr });
          }
        });
      }

      this.checkUnitDestroyed(unit, false);
    } else {
      this.sfx.playMiss();
      this.log(`[적 포격 빗나감] (${col + 1}, ${String.fromCharCode(65 + row)}): 공터 탄착`, 'system');
    }

    this.createSplashTrace(col, row, false);
    this.updateUnitStatusCards();
  }

  // ---------------- 게임 종료 및 UI 업데이트 ----------------

  triggerGameOver(isVictory) {
    this.phase = 'GAMEOVER';

    // 완료된 전장 화면 유지를 위해 적 진영의 모든 타일 정보 공개 (유닛 위치 포함)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.enemyGrid[r][c].revealed = true;
      }
    }

    if (isVictory) {
      this.sfx.playVictory();
      this.log('★☆★ [작전 대성공] 적 대대본부 완파! 아군 전선 완전 장악 및 최종 승리! ★☆★', 'kill');
      const titleEl = document.getElementById('modalResultTitle');
      if (titleEl) {
        titleEl.className = 'victory-title';
        titleEl.textContent = '🏆 VICTORY - 작전 승리';
      }
      const descEl = document.getElementById('modalResultDesc');
      if (descEl) descEl.textContent = '적 사령부 및 주력 부대를 완전히 무력화하여 전투에서 승리했습니다!';
    } else {
      this.sfx.playDefeat();
      this.log('▲▼▲ [작전 실패] 아군 대대본부 완파. 통신 두절 및 최종 패배. ▲▼▲', 'enemy-action');
      const titleEl = document.getElementById('modalResultTitle');
      if (titleEl) {
        titleEl.className = 'defeat-title';
        titleEl.textContent = '💀 DEFEAT - 작전 실패';
      }
      const descEl = document.getElementById('modalResultDesc');
      if (descEl) descEl.textContent = '아군 사령부와 전력이 무력화되어 작전에 실패했습니다.';
    }

    document.getElementById('resTurnCount').textContent = this.turnCount;
    document.getElementById('resPlayerShots').textContent = this.stats.playerShots;
    const hitRate = this.stats.playerShots > 0 ? Math.round((this.stats.playerHits / this.stats.playerShots) * 100) : 0;
    document.getElementById('resHitRate').textContent = `${hitRate}%`;
    document.getElementById('resKills').textContent = `${this.stats.playerKills} 개 부대`;

    const subHelp = document.getElementById('subHelpText');
    if (subHelp) subHelp.textContent = '작전이 종료되었습니다. 완료된 전장 화면을 관람하시거나, 다시 시작 또는 종료하실 수 있습니다.';

    document.getElementById('resultModal').classList.add('show');
  }

  restartGame() {
    const resModal = document.getElementById('resultModal');
    if (resModal) resModal.classList.remove('show');
    const bar = document.getElementById('endGameBar');
    if (bar) bar.classList.remove('show');
    location.reload();
  }

  exitGame() {
    const resModal = document.getElementById('resultModal');
    if (resModal) resModal.classList.remove('show');

    const bar = document.getElementById('endGameBar');
    if (bar) bar.classList.add('show');

    this.showToast('작전 종료: 브라우저 창(탭)을 닫아 종료하십시오.');
    this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
    this.log('[게임 종료] 작전이 종료되었습니다. 브라우저 창(탭)을 닫아주십시오. (완료된 전장 화면을 자유롭게 둘러보실 수 있습니다.)', 'system');

    // 브라우저 창 닫기 시도
    window.close();
  }

  viewCompletedBoard() {
    const resModal = document.getElementById('resultModal');
    if (resModal) resModal.classList.remove('show');
    const bar = document.getElementById('endGameBar');
    if (bar) bar.classList.add('show');
    this.showToast('완료된 전장 관람 모드 (상단 바에서 다시 시작 가능)');
  }

  showResultModalAgain() {
    const bar = document.getElementById('endGameBar');
    if (bar) bar.classList.remove('show');
    const resModal = document.getElementById('resultModal');
    if (resModal) resModal.classList.add('show');
  }

  updateUnitStatusCards() {
    // 아군 카드 갱신
    this.playerUnits.forEach(u => {
      const card = document.getElementById(`card-p-${u.id.toLowerCase()}`);
      if (!card) return;

      if (u.isDestroyed) {
        card.classList.add('destroyed');
      } else {
        card.classList.remove('destroyed');
      }

      const gauge = card.querySelector('.cell-gauge-grid');
      if (gauge) {
        let html = '';
        for (let r = 0; r < u.height; r++) {
          for (let c = 0; c < u.width; c++) {
            const hp = u.cells[r][c];
            let cls = 'alive';
            if (hp === 0) cls = 'dead';
            html += `<div class="cell-gauge-item ${cls}"></div>`;
          }
        }
        gauge.innerHTML = html;
      }

      const statusSpan = card.querySelector('.unit-status-text');
      if (statusSpan) {
        let aliveCells = 0;
        for (let r = 0; r < u.height; r++) {
          for (let c = 0; c < u.width; c++) {
            if (u.cells[r][c] > 0) aliveCells++;
          }
        }
        statusSpan.textContent = u.isDestroyed ? '완파' : `정상 (${aliveCells}/${u.width * u.height})`;
      }
    });

    // 적군 카드 갱신
    this.enemyUnits.forEach(u => {
      const card = document.getElementById(`card-e-${u.id.toLowerCase()}`);
      if (!card) return;

      if (u.isDestroyed) {
        card.classList.add('destroyed');
        const statusSpan = card.querySelector('.unit-status-text');
        if (statusSpan) statusSpan.textContent = '완파 확인';
      } else {
        card.classList.remove('destroyed');
        const statusSpan = card.querySelector('.unit-status-text');
        if (statusSpan) statusSpan.textContent = '은폐 중 (추리 필요)';
      }
    });
  }

  updatePlacementUI() {
    const list = document.getElementById('placementUnitsList');
    if (!list) return;

    list.innerHTML = '';
    this.placementUnitDefs.forEach((def, idx) => {
      const btn = document.createElement('button');
      btn.className = 'placement-btn';
      if (this.placedUnitIds.has(def.id)) btn.classList.add('placed');
      if (this.selectedUnitToPlace && this.selectedUnitToPlace.id === def.id) btn.classList.add('selected');

      const isRot = this.selectedUnitToPlace && this.selectedUnitToPlace.id === def.id && this.selectedUnitToPlace.isRotated;
      const sizeStr = isRot ? `${def.h}x${def.w}` : `${def.w}x${def.h}`;
      btn.textContent = `${def.name} (${sizeStr})`;

      btn.onclick = () => {
        this.selectUnitForPlacement(idx);
      };
      list.appendChild(btn);
    });

    const rotateBtn = document.getElementById('btnRotate');
    if (rotateBtn) {
      rotateBtn.disabled = !this.selectedUnitToPlace || !this.selectedUnitToPlace.canRotate;
    }

    const startBtn = document.getElementById('btnStartBattle');
    if (startBtn) {
      startBtn.disabled = this.playerUnits.length < this.placementUnitDefs.length;
    }
  }

  updateBattleUI() {
    const selectedCount = this.selectedTargets.length;
    const playerSalvo = this.getSalvoInfo(false);
    const maxSalvo = playerSalvo.count;

    const salvoEl = document.getElementById('salvoCountVal');
    if (salvoEl) {
      salvoEl.textContent = `${selectedCount} / ${maxSalvo} 발`;
    }

    const fireBtn = document.getElementById('btnFire');
    if (fireBtn) {
      fireBtn.disabled = selectedCount === 0 || this.isFiringAnimation || this.turn !== 'PLAYER' || maxSalvo === 0;
      if (selectedCount === maxSalvo) {
        fireBtn.textContent = `🔥 ${maxSalvo}발 일제 포격 (FIRE)`;
      } else {
        fireBtn.textContent = `🔥 ${selectedCount}발 포격 (FIRE)`;
      }
    }

    const flareBtn = document.getElementById('btnFlare');
    if (flareBtn) {
      const hasCompany = this.playerUnits.some(u => ['ALPHA', 'BRAVO', 'CHARLIE'].includes(u.type) && !u.isDestroyed);
      flareBtn.disabled = this.flareCooldown > 0 || !hasCompany || this.turn !== 'PLAYER' || this.isFiringAnimation;
      flareBtn.textContent = this.flareCooldown > 0 ? `조명탄 (${this.flareCooldown}턴 후)` : '조명탄 정찰';
    }
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const pos = this.renderer.getGridPos(mx, my);
      if (pos) {
        this.renderer.hoverCol = pos.col;
        this.renderer.hoverRow = pos.row;

        const colStr = pos.col + 1;
        const rowStr = String.fromCharCode(65 + pos.row);
        document.getElementById('cursorCoord').textContent = `${colStr}, ${rowStr}`;
      } else {
        this.renderer.hoverCol = -1;
        this.renderer.hoverRow = -1;
        document.getElementById('cursorCoord').textContent = '--';
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.renderer.hoverCol = -1;
      this.renderer.hoverRow = -1;
      document.getElementById('cursorCoord').textContent = '--';
    });

    this.canvas.addEventListener('click', e => {
      this.sfx.init();

      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const pos = this.renderer.getGridPos(mx, my);
      if (!pos) return;

      if (this.phase === 'PLACEMENT') {
        this.placePlayerUnit(pos.col, pos.row);
      } else if (this.phase === 'BATTLE') {
        this.handleTargetClick(pos.col, pos.row);
      }
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') {
        if (this.phase === 'PLACEMENT') {
          this.rotatePlacementUnit();
        }
      }
    });
  }

  log(msg, type = 'system') {
    const container = document.getElementById('battleLog');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = msg;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  showToast(text) {
    const overlay = document.getElementById('toastOverlay');
    if (!overlay) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = text;
    overlay.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3100);
  }

  loop() {
    this.renderer.render(this);
    requestAnimationFrame(this.loop);
  }
}
