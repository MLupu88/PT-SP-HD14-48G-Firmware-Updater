      });
      const _=()=>{
        f.value===1&&N()
      },$=async xe=>{
        if(xe)return new Promise((Le,Be)=>{
          gt.send("get-port-list"),gt.once("reply-get-port-list",(Me,We)=>{
            We.length===0?s.value="":s.value===""?s.value=We[0].path:We.find(at=>at.path===m.value)||(s.value=We[0].path),c.value=We,Le(We)
          })
        })
      };
      (async()=>{
        try{
          await $(!0)
        }catch(xe){
          console.log(xe)
        }
      })();
      const A=()=>{
        const xe=XG(),Le=[];
        return Object.keys(xe).forEach(Be=>{
          xe[Be].forEach(Me=>{
            Me.address!=="127.0.0.1"&&Me.family==="IPv4"&&Me.mac!=="00:00:00:00:00:00"&&Le.push(Object.assign(Me,{
              name:Be
            }))
          })
        }),Le
      },P=xe=>{
        console.log(777,xe),p.value.find(Le=>Le.address===xe.address)||p.value.push(xe)
      },D=async()=>{
        try{
          p.value=[],await I()
        }catch{

        }finally{
          await B(),g.value=!1
        }
      },I=()=>new Promise((xe,Le)=>{
        try{
          const Be=A();
          g.value=!0,Be.forEach(Me=>{
            let We=k0.createSocket("udp4");
            We.bind(Di,Me.address,()=>{
              We.setBroadcast(!0)
            }),We.on("message",async(je,at)=>{
              if(!(at.address===Me.address||je.byteLength<=59))try{
                const Ce=JSON.parse(a.write(je));
                Ce.comhead===T0&&P({
                  size:je.byteLength,address:Ce.ip,mac:Ce.mac,gateway:Ce.gateway,mask:Ce.mask,sftpPort:Ce.sftp,reqIp:Me.address,tcpPort:Ce.tcpPort
                })
              }catch(Ce){
                console.log(Ce),xe(!0)
              }
            }),We.send(T0,Di,$0,je=>{
              setTimeout(()=>{
                We&&We.close(),p.value.length===0?h.value="":h.value!==""?p.value.findIndex(at=>at.address===h.value)===-1&&(h.value=p.value[0].address):h.value=p.value[0].address,xe(!0)
              },500)
            }),We.on("error",je=>{
              xe(!0),console.log(je)
            })
          })
        }catch{
          g.value=!1,xe(!0)
        }
      }),B=()=>new Promise((xe,Le)=>{
        try{
          const Be=A();
          g.value=!0,Be.forEach(Me=>{
            let We=k0.createSocket("udp4");
            We.bind(Di,Me.address,()=>{
              We.setBroadcast(!0)
            }),We.on("message",(je,at)=>{
              console.log(je),(je.byteLength===55||je.byteLength===57)&&P({
                size:at.size,address:at.address,mac:Array.from(je).slice(0,6).map(Ce=>Ce.toString(16)).join(":"),gateway:je.slice(10,14).join("."),mask:je.slice(14,18).join("."),sftpPort:je.byteLength===55?22:je.slice(55,56)[0]*256+je.slice(56)[0],reqIp:Me.address,tcpPort:8e3
              })
            }),We.send(xZ,Di,$0,je=>{
              console.log(66),setTimeout(()=>{
                We&&We.close(),p.value.length===0?h.value="":h.value!==""?p.value.findIndex(at=>at.address===h.value)===-1&&(h.value=p.value[0].address):h.value=p.value[0].address,xe(p.value)
              },500)
            }),We.on("error",je=>{
              xe(je),console.log(je)
            })
          })
        }catch(Be){
          g.value=!1,xe(Be)
        }
      }),S=async()=>{
        try{
          const xe=await qG("bin");
          if(!xe)return!1;
          Wt(`Select File: ${xe[0]}`);
          const Le=await ct(wd(xe[0]));
          if(Le.length===0){
            if(!F(xe[0]))return m.value="",b.value="",!1;
            if(E0(xe[0]).includes("EDID")&&!YG(Uint8Array.from(wd(xe[0]))))return m.value="",b.value="",r("Invalid EDID file, please check","error");
            w.value=Uint8Array.from(wd(xe[0]))
          }else{
            if(Fe.value=Le,re.value){
              const Be=re.value.upgrade;
              for(let Me=0;
              Me<Be.length;
              Me++)if(console.log(Fe.value,Fe.value.find(We=>We.name===Be[Me].upgradeName),Be[Me].upgradeName),!Fe.value.find(We=>We.name===Be[Me].upgradeName))return Fe.value=[],r("Please check if your packaged file is in order.","error")
            }else return Fe.value=[],r("Please check if your packaged file is in order.","error");
            for(let Be=0;
            Be<Le.length;
            Be++){
              const Me=Le[Be].name;
              if(Me!==Bi&&!F(Me))return m.value="",b.value="",!1
            }
          }m.value=xe[0],b.value=E0(xe[0])
        }catch{
          return r("Please check if your packaged file is in order.","error")
        }
      },F=xe=>{
        const Le=K(xe??b.value);
        if(Object.keys(Le).length===0){
          r("Change the correct file name!","error");
          return
        }return!0
      },K=xe=>{
        let Le=null;
        return Object.keys(Fv).forEach(Be=>{
          xe.includes(Be)&&(Le=Fv[Be],Le.flag=R(xe),Le.key=Be)
        }),Le
      },R=xe=>{
        const Le=/_([0-9A-Fa-f]{1,3})_/,Be=xe.match(Le);
        return console.log("匹配到的FLAG",Be),Be&&Be.length>0&&Be[1]?Be[1]:"00"
      },W=()=>{
        gt.send("change-byte-type",u.value)
      },N=()=>{
        console.log(6),gt.send("disconnect-com"),v.value=!1,C.value="",gt.removeAllListeners("update-log"),gt.removeAllListeners("close-com")
      };
      N();
      const H=()=>{
        v.value?N():(gt.send("connect-com",s.value,l.value),gt.once("reply-connect-com",()=>{
          gt.on("update-log",(xe,Le)=>{
            oe.value=Le
          }),gt.on("close-com",()=>{
            N(),d.value=!1,$(!0)
          }),gt.removeAllListeners("fail-connect-com"),v.value=!0,ge()
        }),gt.once("fail-connect-com",()=>{
          gt.removeAllListeners("reply-connect-com"),bd("Connection fail"),v.value=!1
        }))
      },z=(xe,Le={

      })=>new Promise((Be,Me)=>{
        const{
          isGetVersion:We,timeout:je,isGetJson:at
        }=Le;
        if(f.value===0){
          if(!v.value)return Me("Serial port disconnected");
          let Ce=new Date;
          console.log("start",Ce,Ce.getMilliseconds().toString().padStart(3,"0")),gt.send("send-com-data",xe,je),gt.once("reply-send-com-data",(Ke,He)=>{
            let nt=new Date;
            console.log("end",nt,nt.getMilliseconds().toString().padStart(3,"0")),gt.removeAllListeners("fail-send-com-data"),Be(He)
          }),gt.once("fail-send-com-data",(Ke,He)=>{
            gt.removeAllListeners("reply-send-com-data"),Me(He)
          })
        }else if(We||at){
          const Ce=p.value.find(Ke=>Ke.address===h.value);
          console.log(Ce),gt.send("send-tcp-data",h.value,{
            tcpPort:Ce.tcpPort,data:xe,timeout:je,isGetJson:at
          }),gt.once("reply-send-tcp-data",(Ke,He)=>{
            Be(He),gt.removeAllListeners("fail-send-tcp-data")
          }),gt.once("fail-send-tcp-data",(Ke,He)=>{
            gt.removeAllListeners("reply-send-tcp-data"),Me(He)
          })
        }
      }).then(Be=>(Be instanceof Object?(xe.byteLength<=1024&&Wt(`${V.value} Send => ${xe}`),Wt(`${V.value} Reply => ${JSON.stringify(Be)}`)):(xe.byteLength<=1024&&Wt(`${V.value} Send => ${Array.from(xe).map(Me=>Me.toString(16))}`),Wt(`${V.value} Reply => ${Array.from(Be).map(Me=>Me.toString(16))}`)),Promise.resolve(Be))).catch(Be=>(xe.byteLength<=1024&&Wt(`${V.value} Send => ${Array.from(xe).map(Me=>Me.toString(16))}`),Wt(`${V.value} Reply => ${Be}`,"error"),Promise.reject(Be))),V=E(()=>f.value===0?`${s.value}(${l.value})`:h.value),J=E(()=>u.value?13:18),se=(xe,Le=16)=>{
        const Be=Le===10?xe.reduce((Me,We)=>Me+We):xe.map(Me=>parseInt(Me,16)).reduce((Me,We)=>Me+We);
        return u.value?(256-(Be-Math.floor(Be/256)*256)).toString(16):(Be-Math.floor(Be/256)*256).toString(16)
      },pe=(xe,Le)=>{
        const Me=(xe?["a5","5b"]:["50","56","54"]).concat(Le),je=(xe?13:18)-Me.length-1;
        for(let at=0;
        at<je;
        at++)Me.push("00"),at===je-1&&Me.push(se(Me));
        return Uint8Array.from(Me.map(at=>parseInt(at,16)))
      },he=L(!1),ge=async()=>{
        const xe=u.value?4:5;
        try{
          gt.send(Jn,"version");
          const Le=pe(u.value,["01","13"]),Be=await z(Le,{
            isGetVersion:!0
          }),Me=Be[xe+2]<10?`0${Be[xe+2]}`:Be[xe+2],We=Be[xe+4]<10?`0${Be[xe+4]}`:Be[xe+4],je=`V${Be[xe]}.${Me}.${We}`;
          !Be[xe]||!Me||!We?C.value="":C.value=je,he.value=Be[10]===1
        }catch{
          C.value="";
          const Be=pe(u.value,["01","03"]),Me=await z(Be,{
            isGetVersion:!0
          }),We=Me[xe+2]<10?`0${Me[xe+2]}`:Me[xe+2],je=`V${Me[xe]}.${We}`;
          await z(Be,{
            isGetVersion:!0
          }),!Me[xe]||We?C.value="":C.value=je
        }finally{
          gt.send(Jn,"cmd")
        }
      };
      $e([h,u,f],()=>{
        f.value===0?v.value?ge():C.value="":h.value!==""?ge():C.value=""
      });
      const ue=async()=>{
        d.value=!0;
        try{
          if(!await Ho())return d.value=!1,bd("Upgrade file error, please select the correct file.");
          Fe.value.length===0?(await vn(1e3),gt.send(Jn,"upgrade"),Wt("***************Start upgrade***************"),Wt(`Upgrade file: ${b.value}`),y.value=0,f.value===0?await _e():await T()):(Ue.value=[],Ye.value=[],Fe.value.forEach((Le,Be)=>{
            if(Le.name===Bi)Ue.value[Be]=!1,Ye.value[Be]=!0;
            else{
              const{
                cmdArrDec:Me,ipCmdArr:We
              }=Se(Le.name);
              Ue.value[Be]=!1,Ye.value[Be]=!1,f.value===0&&!Me&&(Ue.value[Be]=!1,Ye.value[Be]=!0),f.value===1&&!We&&(Ue.value[Be]=!1,Ye.value[Be]=!0)
            }
          }),d.value=!1,ve.value=!0)
        }catch{

        }finally{

        }
      },Se=xe=>{
        const{
          cmdArr:Le,endCmdArr:Be,flag:Me,timeout:We,fileName:je,ipCmdArr:at,upgradeTime:Ce,size:Ke,indexBit:He,key:nt
        }=K(xe??b.value);
        let Nt=isNaN(Number(Me))?Me:Number(Me).toString(16);
        const Dt=u.value?["a5","5b"]:["50","56","54"],It=Dt.concat(Le).concat([Nt]),Et=Dt.concat(Be).concat([Nt]);
        if(console.log(b.value),b.value.includes("EDID")){
          const Ne=GG(w.value.byteLength);
          console.log("size",It,Ne.length<2?["00"].concat(Ne):Ne),It.push(...Ne.length<2?["00"].concat(Ne):Ne),console.log("size",It)
        }const rn=J.value-1-It.length;
        for(let Ne=0;
        Ne<rn;
        Ne++)It.push("00"),Et.push("00"),Ne===rn-1&&(It.push(se(It)),Et.push(se(Et)));
        return{
          cmdArrDec:Le?Uint8Array.from(It.map(Ne=>parseInt(Ne,16))):null,confirmCmdDec:Be?Uint8Array.from(Et.map(Ne=>parseInt(Ne,16))):null,timeout:We,cmdArrHex:It,confirmHex:Et,fileName:je,ipCmdArr:at,upgradeTime:Ce,size:Ke,indexBit:He,flag:Nt,key:nt
        }
      },_e=async()=>{
        if(!F())return;
        const{
          cmdArrDec:xe,confirmCmdDec:Le,timeout:Be,size:Me
        }=Se();
        if(!xe)return d.value=!1,r("The module cannot be upgraded through a serial port","error");
        try{
          await Q(2,xe,Be),await vn(2e3),Le&&await z(Le,{
            timeout:Be
          });
          const{
            fileName:We
          }=K(b.value);
          We==="firmware_9396.bin"?Ee(Be,Me):De(Be,Me)
        }catch(We){
          return d.value=!1,Wt(`Upgrade fail: ${We}`,"error"),r("Upgrade is not responding! Please confirm whether the device is 13 bytes or 18 bytes.","error")
        }
      },Ee=(xe,Le)=>{
        const{
          indexBit:Be
        }=Se(),Me=Ve(w.value),We=async(je=0)=>{
          let at=["fe","ef"].map(Et=>parseInt(Et,16));
          const Ce=Math.floor(je/256),Ke=je-Math.floor(je/256)*256,He=Array.from(Me.slice(je*Le,(je+1)*Le)),nt=Le-He.length;
          for(let Et=0;
          Et<nt;
          Et++)He.push(255);
          je*Le>=Me.byteLength-Le?at=at.concat([Be+128,Ce,Ke]).concat(Array.from(He)):at=at.concat([Be,Ce,Ke]).concat(Array.from(He)),at.push(parseInt(se(at,10),16)),at=Buffer.from(at);
          let Nt=window.setTimeout(()=>{
            r("Upgrader timeout","error"),d.value=!1
          },xe);
          const Dt=await z(at,{
            timeout:xe
          });
          window.clearTimeout(Nt),y.value=Math.min(Math.floor((je+1)*Le/Me.byteLength*100),100);
          const It=Dt[2];
          It===0?setTimeout(()=>{
            We(je)
          },500):It===2?(d.value=!1,r("Upgrader fail","error"),gt.send(Jn,"cmd")):(It===Be||It===Be+128)&&(je*Le<Me.byteLength-Le?await We(++je):(await vn(3e3),d.value=!1,r("Upgrader successfully!","success"),gt.send(Jn,"cmd")))
        };
        We()
      },De=(xe=1e4,Le)=>{
        const Be=Ve(w.value),Me=async(We=0)=>{
          if(!v.value)return r("Upgrader fail","error");
          let je=["fe","ef"].map(nt=>parseInt(nt,16));
          const at=Math.floor(We/256),Ce=We-Math.floor(We/256)*256,Ke=Array.from(Be.slice(We*Le,(We+1)*Le)),He=Le-Ke.length;
          for(let nt=0;
          nt<He;
          nt++)Ke.push(255);
          We*Le>=Be.byteLength-Le?je=je.concat([at+128,Ce]).concat(Array.from(Ke)):je=je.concat([at,Ce]).concat(Array.from(Ke)),je.push(parseInt(se(je,10),16)),je=Uint8Array.from(je);
          try{
            Wt(`${V.value} Send => Data frame ${We}`);
            const nt=await Q(2,je,xe);
            if(y.value=Math.min(Math.floor((We+1)*Le/Be.byteLength*100),99),nt[4]===1)setTimeout(()=>{
              Me(We)
            },100);
            else if(nt[4]===2)d.value=!1,r("Upgrader fail","error");
            else if(nt[4]===0){
              if(We*Le<Be.byteLength-Le)return await Me(++We);
              gt.send(Jn,"cmd"),await vn(3e3),y.value=100,await vn(7e3),d.value=!1,r("Upgrader successfully!","success"),Wt("***************End upgrade***************"),ge()
            }else d.value=!1,Wt("Upgrader fail","error"),gt.send(Jn,"cmd"),Wt("***************End upgrade***************"),r("Upgrader fail","error")
          }catch(nt){
            r(nt,"error"),d.value=!1,gt.send(Jn,"cmd"),Wt(`Upgrader fail: ${nt}`,"error"),Wt("***************End upgrade***************")
          }
        };
        Me()
      },Q=(xe,Le,Be=5e3)=>new Promise((Me,We)=>{
        const je=async(at=0)=>{
          if(!v.value)return We("Serial port disconnected");
          try{
            const Ce=await z(Le,{
              timeout:Be
            });
            Me(Ce)
          }catch(Ce){
            at<xe?await je(++at):We(Ce)
          }
        };
        je()
      }),T=async()=>{
        try{
          if(b.value.includes("EDID"))return d.value=!1,r("This module does not allow network port upgrades","error");
          const xe=Ve(w.value),{
            fileName:Le,timeout:Be,upgradeTime:Me,flag:We
          }=Se(),je=X(We,J.value,xe),at=p.value.find(Dt=>Dt.address===h.value),Ce={
            host:h.value,port:at!=null&&at.sftpPort?at==null?void 0:at.sftpPort:22,username:"root",password:"17909",readyTimeout:5e3,localAddress:at.reqIp
          };
          console.log(Ce);
          const Ke={
            localStatic:xe,remoteStatic:`/tmp/samba/${Le}`
          };
          if(t("Uploading firmware files"),await ae(Ce,Ke),n.value.setText("Upload successfully"),await vn(1e3),n.value.close(),Le==="firmware.bin"){
            const Dt=X(We,13,xe),It=X(We,18,xe);
            j(h.value,Dt),await vn(2e3),j(h.value,It),await vn(2e3)
          }else Le==="firmware_web.bin"?(await j(h.value,"Upgrader Web!"),await vn(2e3)):await j(h.value,je);
          let He=0,nt=0;
          const Nt=()=>new Promise((Dt,It)=>{
            const Et=async()=>{
              try{
                const jt=await ne(h.value);
                if(He++,nt>30)return It(!1);
                if(typeof jt!="string"){
                  nt++,setTimeout(Et,500);
                  return
                }const rn=jt.toLowerCase();
                if(rn.includes("fail"))return It(!1);
                if(Le==="firmware_web.bin"){
                  if(jt.includes("success"))return y.value=100,await vn(3e3),Dt(!0);
                  He++,y.value=Math.min(Math.floor(He/100*100),99),setTimeout(Et,500)
                }else{
                  if(rn.includes("ok")||y.value>=100)return y.value=100,await vn(3e3),Dt(!0);
                  {
                    const Ne=jt.replace(/\s/g,""),ut=Ne.indexOf("/"),kt=Math.min(Math.floor(parseInt(Ne.slice(ut-6,ut),16)/parseInt(Ne.slice(ut+1,ut+7),16)*100),100);
                    y.value=isNaN(kt)?y.value:kt,setTimeout(Et,500)
                  }
                }
              }catch(jt){
                if(nt>30)return It(jt);
                nt++,setTimeout(Et,500)
              }
            };
            Et()
          });
          if(await vn(5e3),k.indexOf(Le)>-1)await U(Me),await r("Upgrader successfully!","success"),d.value=!1,Wt("***************End upgrade***************");
          else{
            const Dt=await Nt();
            d.value=!1,ge(),await r("Upgrader successfully!","success"),Wt("***************End upgrade***************")
          }
        }catch(xe){
          n.value.close(),r("Upgrader fail!","error"),d.value=!1,Wt(`${V.value} Send fail => ${xe}`),Wt("***************End upgrade***************")
        }
      },ne=xe=>new Promise((Le,Be)=>{
        gt.send("http-send-upgrade-query",xe,5e3),gt.once("reply-http-send-upgrade-query",(Me,We)=>{
          gt.removeAllListeners("fail-http-send-upgrade-query"),Le(We)
        }),gt.once("fail-http-send-upgrade-query",()=>{
          gt.removeAllListeners("reply-http-send-upgrade-query"),Be(!1)
        })
      }),ae=(xe,Le)=>new Promise((Be,Me)=>{
        gt.send("sftp-upload-file",xe,Le),gt.once("reply-sftp-upload-file",We=>{
          gt.removeAllListeners("reply-sftp-upload-file"),Be(!0)
        }),gt.once("fail-sftp-upload-file",()=>{
          gt.removeAllListeners("reply-sftp-upload-file"),Me(!1)
        })
      }),j=(xe,Le)=>new Promise((Be,Me)=>{
        gt.send("http-send-upgrade-cmd",xe,Le,15e3),gt.once("reply-http-send-upgrade-cmd",(We,je)=>{
          gt.removeAllListeners("fail-http-send-upgrade-cmd"),Be(je)
        }),gt.once("fail-http-send-upgrade-cmd",()=>{
          gt.removeAllListeners("reply-http-send-upgrade-cmd"),Me(!1)
        })
      }),U=xe=>new Promise(Le=>{
        gt.send("upgrade-rs02",xe,V.value),gt.on("upgrade-rs02-progress",(Be,Me)=>{
          y.value=Me,Me>=100&&(gt.removeAllListeners("upgrade-rs02-progress"),Le(!0))
        })
      }),X=(xe,Le,Be,Me)=>{
        const We=Be??w.value,je=We.reduce((Et,jt)=>Et+jt).toString(16),at=je.substring(je.length-4),Ce=We.length.toString(16),{
          ipCmdArr:Ke
        }=K(Me??b.value);
        let He="",nt=(u.value?["a5","5b"]:["50","56","54"]).concat(Ke);
        if(Ce.length<8){
          let Et="";
          for(let jt=0;
          jt<8-Ce.length;
          jt++)Et+="0";
          He=`${Et}${Ce}`
        }else He=Ce.substring(Ce.length-9);
        let Nt=at+He;
        for(let Et=0;
        Et<Nt.length;
        Et++)Et%2===0&&nt.push(Nt.substr(Et,2));
        xe.length<=2&&nt.push(xe.length===1?`0${xe}`:xe);
        const Dt=nt.length,It=J.value;
        if(Dt<It)for(let Et=0;
        Et<It-Dt;
        Et++)nt.push("00");
        return`hex(${nt.join(",")})`
      };
      wr(()=>{
        N(),gt.send("clear-upgrade-rs02")
      });
      const oe=L(""),fe=()=>{
        oe.value="",gt.send("clear-log")
      },ee=async()=>{
        try{
          const xe=await UG("log");
          gt.send("save-log",xe)
        }catch{

        }
      },ye=L(!1),Te=()=>{
        ye.value||(gt.send(Jn,"cmd"),ye.value=!0,z(Buffer.from(`${Ie.value}${le.value?`\r `:""}`),{
          timeout:5e3
        }),setTimeout(()=>{
          ye.value=!1
        },1e3))
      },le=L(!0),Ie=L(""),Fe=L([]),Ye=L([]),ct=async xe=>new Promise(async(Le,Be)=>{
        const Me=[];
        await new oZ().loadAsync(xe).then(je=>{
          let at=0;
          const Ce=je.filter((Ke,He)=>!He.dir).length;
          je.forEach(async(Ke,He)=>{
            const nt=new Uint8Array(await He.async("arraybuffer"));
            console.log(He.name,nt),He.dir||(at=at+1,Me.push({
              name:Ke,buffer:nt,check:!0
            })),Ce===at&&Le(Me)
          })
        }).catch(je=>{
          console.log(je),Le([])
        })
      }),Ue=L([]),we=()=>{
        m.value="",w.value=void 0,Fe.value=[]
      },ve=L(!1),de=async()=>{
        if(!Ue.value.find(xe=>xe))return r("Choose at least one module to upgrade","error");
        d.value=!0,y.value=0,ve.value=!1,t("Start upgrade..."),f.value===0?lt():en()
      },ke=E(()=>{
        const xe=[];
        return Fe.value.filter((Le,Be)=>!Ye[Be]),re.value?(re.value.upgrade.forEach(Le=>{
          xe.push(Fe.value.find((Be,Me)=>Be.name===Le.upgradeName&&Ue.value[Me]))
        }),xe.filter(Le=>Le)):Fe.value.filter((Le,Be)=>!Ye[Be])
      }),re=E(()=>{
        try{
          const xe=Fe.value.find(Me=>Me.name===Bi),Be=new TextDecoder("utf-8").decode(xe.buffer);
          return JSON.parse(Be)
        }catch{
          return!1
        }
      }),Ve=xe=>{
        const Le=new DataView(xe.buffer),Be=Le.getUint32(xe.byteLength-4,!0);
        return Be<=xe.byteLength-4&&Le.getUint32(Be,!0)===2882360661||Sn.value?xe.slice(0,Be):xe
      },lt=()=>{
        gt.send(Jn,"upgrade"),Wt("***************Start upgrade***************"),Wt(`Upgrade file: ${b.value}`);
        const xe=async(Le=0)=>{
          var Be,Me,We;
          if(!v.value)return(Be=n.value)==null||Be.close(),r("Upgrader fail","error");
          try{
            const{
              name:je,buffer:at
            }=ke.value[Le],{
              cmdArrDec:Ce,confirmCmdDec:Ke,timeout:He,size:nt,key:Nt
            }=Se(je);
            await Q(2,Ce,He),await vn(2e3),Ke&&await z(Ke,{
              timeout:He
            });
            const{
              fileName:Dt
            }=K(je);
            y.value=0,n.value.setText(`(${Le+1}/${ke.value.length})Upgrade ${Nt}: ${y.value}%`);
            const It=Ve(at);
            if(Dt==="firmware_9396.bin"?await Xt(It,je,Le,He,nt):await St(It,je,Le,nt,He),Le>=ke.value.length-1)gt.send(Jn,"cmd"),(Me=n.value)==null||Me.close(),d.value=!1,r("Upgrader successfully!","success"),ge(),Wt("***************End upgrade***************");
            else return xe(++Le)
          }catch(je){
            Wt(`Upgrade fail: ${je}`),gt.send(Jn,"cmd"),(We=n.value)==null||We.close(),r("Upgrader fail!","error"),d.value=!1,Wt("***************End upgrade***************")
          }
        };
        xe()
      },St=(xe,Le,Be,Me,We)=>{
        const{
          key:je
        }=Se(Le);
        return new Promise((at,Ce)=>{
          y.value=0;
          const Ke=async(He=0)=>{
            var jt;
            if(!v.value)return(jt=n.value)==null||jt.close(),Ce("Serial port disconnected");
            let nt=["fe","ef"].map(rn=>parseInt(rn,16));
            const Nt=Math.floor(He/256),Dt=He-Math.floor(He/256)*256,It=Array.from(xe.slice(He*Me,(He+1)*Me)),Et=Me-It.length;
            for(let rn=0;
            rn<Et;
            rn++)It.push(255);
            He*Me>=xe.byteLength-Me?nt=nt.concat([Nt+128,Dt]).concat(Array.from(It)):nt=nt.concat([Nt,Dt]).concat(Array.from(It)),nt.push(parseInt(se(nt,10),16)),nt=Uint8Array.from(nt);
            try{
              Wt(`${V.value} Send => Data frame ${He}`);
              const rn=await Q(2,nt,We);
              if(y.value=Math.min(Math.floor((He+1)*Me/xe.byteLength*100),99),n.value.setText(`(${Be+1}/${ke.value.length})Upgrade ${je}: ${y.value}%`),rn[4]===1)setTimeout(()=>{
                Ke(He)
              },100);
              else if(rn[4]===2)d.value=!1,Ce(!1);
              else if(rn[4]===0){
                if(He*Me<xe.byteLength-Me)return await Ke(++He);
                await vn(3e3),y.value=100,n.value.setText(`(${Be+1}/${ke.value.length})Upgrade ${je}: ${y.value}%`),await vn(7e3),at(!0)
              }else Ce(!1)
            }catch{
              Ce(!1)
            }
          };
          Ke()
        })
      },Xt=(xe,Le,Be,Me,We)=>{
        const{
          indexBit:je,key:at
        }=Se(Le);
        return new Promise((Ce,Ke)=>{
          const He=async(nt=0)=>{
            if(!v.value)return Ke("Serial port disconnected");
            let Nt=["fe","ef"].map(kt=>parseInt(kt,16));
            const Dt=Math.floor(nt/256),It=nt-Math.floor(nt/256)*256,Et=Array.from(xe.slice(nt*We,(nt+1)*We)),jt=We-Et.length;
            for(let kt=0;
            kt<jt;
            kt++)Et.push(255);
            nt*We>=xe.byteLength-We?Nt=Nt.concat([je+128,Dt,It]).concat(Array.from(Et)):Nt=Nt.concat([je,Dt,It]).concat(Array.from(Et)),Nt.push(parseInt(se(Nt,10),16)),Nt=Buffer.from(Nt);
            let rn=window.setTimeout(()=>{
              Ke(!1)
            },Me);
            const Ne=await z(Nt,{
              timeout:Me
            });
            window.clearTimeout(rn),y.value=Math.min(Math.floor((nt+1)*We/xe.byteLength*100),100),n.value.setText(`(${Be+1}/${ke.value.length})Upgrade ${at}: ${y.value}%`);
            const ut=Ne[2];
            ut===0?setTimeout(()=>{
              He(nt)
            },500):ut===2?Ke(!1):(ut===je||ut===je+128)&&(nt*We<xe.byteLength-We?await He(++nt):(await vn(3e3),Ce(!0)))
          };
          He()
        })
      },en=()=>new Promise((xe,Le)=>{
        const Be=async(Me=0)=>{
          var We;
          try{
            const{
              name:je,buffer:at
            }=ke.value[Me],{
              fileName:Ce,timeout:Ke,upgradeTime:He,flag:nt,key:Nt
            }=Se(je),Dt=Ve(at),It=X(nt,J.value,Dt,je),Et=p.value.find(Ot=>Ot.address===h.value);
            y.value=0,n.value.setText(`(${Me+1}/${ke.value.length})Upgrade ${Nt}: ${y.value}%`);
            const jt={
              host:h.value,port:Et!=null&&Et.sftpPort?Et==null?void 0:Et.sftpPort:22,username:"root",password:"17909",readyTimeout:5e3,localAddress:Et.reqIp
            },rn={
              localStatic:Dt,remoteStatic:`/tmp/samba/${Ce}`
            };
            if(n.value.setText(`(${Me+1}/${ke.value.length})Uploading firmware files`),await ae(jt,rn),n.value.setText(`(${Me+1}/${ke.value.length})Upload successfully`),await vn(1e3),Ce==="firmware.bin"){
              const Ot=X(nt,13,at,je),zn=X(nt,18,at,je);
              j(h.value,Ot),await vn(2e3),j(h.value,zn),console.log(789789),await vn(2e3)
            }else Ce==="firmware_web.bin"?(await j(h.value,"Upgrader Web!"),await vn(2e3)):await j(h.value,It);
            let Ne=0,ut=0;
            const kt=async()=>new Promise((Ot,zn)=>{
              const Hn=async()=>{
                try{
                  const zs=await ne(h.value);
                  if(Ne++,ut>30)return zn(!1);
                  if(typeof zs!="string"){
                    ut++,setTimeout(Hn,500);
                    return
                  }const Gh=zs.toLowerCase();
                  if(Gh.includes("fail"))return zn(!1);
                  if(Ce==="firmware_web.bin"){
                    if(zs.includes("success"))return Ot(!0);
                    Ne++,y.value=Math.min(Math.floor(Ne/100*100),99),n.value.setText(`(${Me+1}/${ke.value.length})Upgrade ${Nt}: ${y.value}%`),setTimeout(Hn,500)
                  }else{
                    if(Gh.includes("ok")||y.value>=100)return y.value=100,Ot(!0);
                    {
                      const ii=zs.replace(/\s/g,""),ui=ii.indexOf("/"),Zh=Math.min(Math.floor(parseInt(ii.slice(ui-6,ui),16)/parseInt(ii.slice(ui+1,ui+7),16)*100),100);
                      y.value=isNaN(Zh)?y.value:Zh,n.value.setText(`(${Me+1}/${ke.value.length})Upgrade ${Nt}: ${y.value}%`),setTimeout(Hn,500)
                    }
                  }
                }catch{
                  ut>30?Ot(!0):(ut++,setTimeout(Hn,500))
                }
              };
              Hn()
            });
            if(await vn(1e3),k.indexOf(Ce)>-1){
              const Ot=$e(y,()=>{
                n.value.setText(`(${Me+1}/${ke.value.length})Upgrade ${Nt}: ${y.value}%`)
              });
              await U(He),Ot()
            }else await kt();
            Me>=ke.value.length-1?(xe(!0),(We=n.value)==null||We.close(),d.value=!1,r("Upgrader successfully!","success"),ge(),Wt("***************End upgrade***************")):(await vn(1e4),await Be(++Me))
          }catch(je){
            Le(je),Wt(`${V.value} Send fail => ${je}`)
          }
        };
        Be()
      }),On=L(!1);
      $e(Ue,()=>{
        On.value=Ue.value.filter(xe=>xe).length===Fe.value.length-Ye.value.filter(xe=>xe).length
      },{
        deep:!0
      });
      const ln=()=>{
        Ue.value.forEach((xe,Le)=>{
          Ye.value[Le]||(Ue.value[Le]=On.value)
        })
      };
      function Rt(xe){
        const Le=[],Be=new DataView(xe.buffer);
        let Me=0;
        if(xe.length>=4){
          const We=xe.length-4,je=Be.getUint32(We,!0);
          je<=xe.length-8&&Be.getUint32(je,!0)===2882360661&&(Me=je)
        }if(Me===0)for(;
        Me<=xe.length-8&&Be.getUint32(Me,!0)!==2882360661;
        )Me++;
        for(;
        Me<=xe.length-8;
        ){
          if(Be.getUint32(Me,!0)!==2882360661){
            Me++;
            continue
          }const je=Be.getUint16(Me+4,!0);
          if(je<10||Me+je>xe.length){
            Me+=4;
            continue
          }const at=Be.getUint8(Me+6),Ce=Be.getUint8(Me+7),Ke=Me+8,He=Me+je-2,nt=new TextDecoder().decode(xe.slice(Ke,He)),Nt=Me+je-2,Dt=Be.getUint16(Nt,!0),It=Jt(xe.slice(Me,Nt));
          try{
            const Et=JSON.parse(nt);
            Le.push({
              info:Et,number:at,last:Ce,isValidCrc:Dt===It
            })
          }catch(Et){
            console.warn(`JSON解析失败 offset:${Me}`,Et)
          }Me+=je
        }return Le
      }function Jt(xe){
        let Le=65535;
        for(const Be of xe){
          Le^=Be<<8;
          for(let Me=0;
          Me<8;
          Me++)Le=Le&32768?Le<<1^4129:Le<<1,Le&=65535
        }return Le
      }const Sn=L(!1),Ho=()=>(gt.send(Jn,"json"),new Promise(async(xe,Le)=>{
        try{
          const Be=Buffer.from(`${JSON.stringify({guihead:"get_device_name"})}\r`),Me=await z(Be,{
            isGetJson:!0
          });
          if(!Me.name&&!Me.infodata)return Sn.value=!1,xe(!0);
          if(Me.name)if(Sn.value=!1,Fe.value.length===0){
            if(b.value.includes("EDID"))return xe(!0);
            (b.value.includes("MCU_MAIN")||b.value.includes("MCU_SUB"))&&w.value.toString().indexOf(Me.name)?xe(!0):xe(!1)
          }else{
            for(let We=0;
            We<Fe.value.length;
            We++){
              const{
                name:je,buffer:at
              }=Fe.value[We];
              (je.includes("MCU_MAIN")||je.includes("MCU_SUB"))&&(at.toString().indexOf(Me.name)||xe(!1))
            }return xe(!0)
          }else if(Sn.value=!0,Fe.value.length===0){
            if(b.value.includes("EDID"))return xe(!0);
            const We=Rt(w.value);
            if(Wt(`Search File List: ${JSON.stringify(We)}`),We.length===0)xe(!1);
            else{
              const{
                info:{
                  product_name:je,firmware_type:at,chip_name:Ce,hardware_info:Ke
                },isValidCrc:He
              }=We[0];
              return He?Me.infodata.find(nt=>nt.product_name===je&&nt.firmware_type===at&&nt.chip_name===Ce&&nt.hardware_info===Ke)?xe(!0):xe(!1):(Wt("CRC checked error"),xe(!1))
            }
          }else{
            for(let We=0;
            We<Fe.value.length;
            We++){
              const{
                name:je,buffer:at
              }=Fe.value[We];
              if(je==="upgrade.json"||je.includes("EDID"))continue;
              const Ce=Rt(at);
              if(Wt(`Search File List: ${JSON.stringify(Ce)}`),console.log(je,at),Ce.length===0)xe(!1);
              else{
                const{
                  info:{
                    product_name:Ke,firmware_type:He,chip_name:nt,hardware_info:Nt
                  },isValidCrc:Dt
                }=Ce[0];
                if(!Dt)return Wt("CRC checked error"),xe(!1);
                if(!Me.infodata.find(It=>It.product_name===Ke&&It.firmware_type===He&&It.chip_name===nt&&It.hardware_info===Nt))return xe(!1)
              }
            }return xe(!0)
          }
        }catch(Be){
          Wt(`err: ${Be}`),Sn.value=!1,xe(!0)
        }finally{
          gt.send(Jn,"cmd")
        }
      })),ja=async()=>{
        try{
          (v.value||h.value!=="")&&!d.value&&!ye.value&&!g.value&&ge()
        }catch{

        }
      };
      return(xe,Le)=>{
        const Be=ft("el-checkbox"),Me=ft("el-radio"),We=ft("el-option"),je=ft("el-select"),at=ft("el-button"),Ce=ft("el-input"),Ke=ft("el-dialog");
        return x(),q("div",sZ,[G(jc,{
          title:"Connection",class:"mt-[30px]"
        },{
          default:te(()=>[Y("div",lZ,[G(Be,{
            modelValue:u.value,"onUpdate:modelValue":Le[0]||(Le[0]=He=>u.value=He),disabled:d.value,onChange:W
