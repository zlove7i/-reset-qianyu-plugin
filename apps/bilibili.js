import Bili from '../model/bilibili.js'
export default class bilibili extends Bili {
    constructor(e) {
        super({
            name: 'bilibili',
            priority: 10000,
            rule: [
                {
                    reg: '',
                    fnc: 'bili',
                    log: false
                },
                {
                    reg: '^#历史b站视频',
                    fnc: 'historyBilibiliVideo'
                },
                {
                    reg: '^#b站解析',
                    fnc: 'setBilibili'
                },
                {
                    reg: '^#设置b站ck',
                    fnc: 'setCk'
                },
                {
                    reg: '^#删除b站视频',
                    fnc: 'deleteBilibili'
                }

            ],
            task: {},
        })
        this.e = e
    }

    async setCk(e) {

        if (!e.isMaster) return true
        if (e.isGroup) {
            return e.reply("请私聊发送cookie")
        }
        e.reply("请发送b站cookie")
        this.setContext('getBcookie', false, 120)
    }

    async getBcookie() {
        let msg = this.e.msg
        if (msg && msg.includes("SESSDATA")) {
            this.Cfg = {
                key: 'cookie',
                value: msg
            }
            this.finish('getBcookie')
            return this.e.reply("cookie设置成功!")
        }
        return this.e.reply("cookie格式不正确!")
    }

    async bili(e) {
        if (!this.Cfg.isjx) return false
        let bv = await this.dealUrl(e)
        if (!bv) return false
        let videoInfo = {};
        videoInfo = await this.getVideoInfo(bv)
        if (videoInfo.duration >= 1800) {
            return e.reply("视频太长了，还是去b站去看吧!")
        }
        let qn = this.autoQuality(videoInfo.duration, e)
        if (this.Cfg.card) {
            e.reply([this.segment.image(videoInfo.pic), `标题: ${videoInfo.title}\n`, `作者: ${videoInfo.owner.name}\n`, `${this.addnull(`播放量: ${this.computew(videoInfo.stat.view)} 弹幕: ${this.computew(videoInfo.stat.danmaku)}`, '弹')}\n`, `${this.addnull(`点赞: ${this.computew(videoInfo.stat.like)}投币: ${this.computew(videoInfo.stat.coin)}`, '投')}`, `\n${this.addnull(`收藏: ${this.computew(videoInfo.stat.favorite)}转发: ${this.computew(videoInfo.stat.share)}`, '转')}`])
        }
        if (this.getVideoAllList().includes(bv)) {
            await this.common.sleep(1000)
            return this.sendVideo(bv, e, '', this.getVideo(bv))
        }
        await this.changeVideo(qn, bv, e)
    }

    async deleteBilibili(e) {
        if (!e.isMaster) return
        if (!e.source && e.source?.message !== '[视频]') {
            return e.reply("不存在视频源！")
        }
        let seq = e.source.seq
        let { md5 } = (await e.group.getChatHistory(seq, 1))[0].message[0]
        let reslut = this.deleteBilibiliData(md5)
        if (!reslut) {
            return e.reply("未收录该b站视频！")
        }
        return e.reply("b站视频删除成功！");
    }

    async setBilibili(e) {
        if (!e.isMaster) return true
        let msg = e.msg.replace('#b站解析', "")
        let keyList = { '卡片': 'card', '': 'isjx' }
        if (msg.endsWith('关闭')) {
            let str = msg.replace("关闭", "")
            this.Cfg = {
                key: keyList[str],
                value: false
            }
            e.reply(`b站解析${str}关闭成功！`)
        } else if (msg.endsWith('开启')) {
            let str = msg.replace("开启", "")
            this.Cfg = {
                key: keyList[msg.replace("开启", "")],
                value: true
            }
            e.reply(`b站解析${str}开启成功！`)
        } else {
            e.reply("无效设置！")
        }
        return true
    }


    async historyBilibiliVideo(e) {
        let biliList = this.getGroupBilibiliData(e.group_id) || []
        if (e.group_id) {
            if (biliList.length == 0) {
                return e.reply("这个群还没有解析过b站视频！")
            } else {
                let videolist = [];
                for (let b of biliList) {
                    videolist.push({ content: `https://www.bilibili.com/${b.bv}`, time: b.time }, { content: this.getVideo(b.bv), time: b.time })
                }
                return e.reply(await this.makeGroupMsg('历史b站视频', videolist))
            }
        }
    }

    async changeVideo(qn, bv, e) {
        let qnlist = [120, 116, 112, 80, 64, 32]
        let videoPath = this.Path.qianyuPath + `resources/video/source_${bv}.mp4`
        let resultPath = this.Path.qianyuPath + `resources/video/${bv}.mp4`
        let { videoUrl, audio } = await this.getQnVideo(qn, bv)
        let audioPath = this.Path.qianyuPath + `resources/video/source_${bv}.mp3`
        let bilibi = await this.downBiliFile(videoUrl, `source_${bv}.mp4`, () => { })
        let ado = await this.downBiliFile(audio, `source_${bv}.mp3`, () => { })
        if (bilibi && ado) {
            await this.compositeBiliVideo(videoPath, audioPath, resultPath, async () => {
                let isSend = await this.sendVideo(bv, e, resultPath, '', async () => {
                    qn = qnlist[qnlist.indexOf(qn) + 1]
                    await this.changeVideo(qn, bv, e)
                })
                if (isSend) {
                    this.File.deleteFile(videoPath)
                    this.File.deleteFile(audioPath)
                    this.File.deleteFile(resultPath)
                }

            }, () => {
                this.File.deleteFile(videoPath)
                this.File.deleteFile(audioPath)
            })

        }
    }

    async dealUrl(e) {
        if (!e.json && !e.url) return false
        let url = e.url
        let urllist = ['b23.tv', 'm.bilibili.com', 'www.bilibili.com']
        let reg2 = new RegExp(`${urllist[0]}|${urllist[1]}|${urllist[2]}`)
        if (e.json) {
            let json = e.json
            url = json.meta.detail_1?.qqdocurl || json.meta.news?.jumpUrl
        }
        if (!url || !url.match(reg2)) return false
        let bilireg = /(BV.*?).{10}/
        let bv = url.match(bilireg)
        if (bv) {
            //存在bv长链接
            bv = bv[0]
        } else {
            //不存在长链接
            let data = await new this.networks({ url: url }).getfetch()
            bv = data.url.match(bilireg)[0]
        }
        return bv
    }


    autoQuality(duration, e) {
        let qn = this.Cfg.qn
        if (duration < 120) {
            qn = 120
        }
        else if (duration >= 120 && duration < 180) {
            qn = 112
        } else if (duration >= 180 && duration < 300) {
            qn = 80
        } else if (duration >= 300 && duration < 480) {
            e.reply("视频时长超过5分钟，已将视频画质降低至720p")
            qn = 64
        } else if (duration >= 480 && duration < 720) {
            e.reply("视频时长超过8分钟，已将视频画质降低至480p")
            qn = 32
        } else if (duration >= 720) {
            e.reply("视频时长超过12分钟，已将视频画质降低至360p")
            qn = 16
        }
        return qn
    }

    async sendVideo(bv, e, videoPath, data, faith = () => { }) {
        let result = await Bot.pickGroup(e.group_id).sendMsg(data || this.segment.video(videoPath)).catch(async (err) => {
            await faith()
            logger.warn(err)
        })
        if (!result) return false
        let res = await Bot.getMsg(result.message_id)
        if (res.message[0].fid.length < 3) {
            e.group.recallMsg(result.message_id)
            await this.common.sleep(1000)
            await this.sendVideo(bv, e, videoPath, data)
        } else {
            this.setBilibiliData(res.message[0], bv)
            this.setGroupBilibiliData(e.group_id, { bv: bv, time: e.time })
        }
        return true
    }


    async downBiliFile(url, path, suc) {
        return await this.downBilibiliVideo({
            url: url,
            headers: {
                'referer': `https://www.bilibili.com/`
            }
        }, path, suc)
    }

    computew(num) {
        return num >= 10000 ? (num / 10000).toFixed(1) + 'w' : num
    }

    addnull(str, target, centerIndex = 14) {
        let idx = str.indexOf(target)
        let strlist = str.split(`${target}`)
        let replaceStr = '  '
        if (idx == centerIndex) {
            return str
        } else if (idx < 7) {
            replaceStr = 'ㅤ'
        }
        let arr = Array.from(str)
        let index = centerIndex - strlist[0].length
        for (let i = 0; i < index; i++) {
            if (/^[a-zA-Z]*$/.test(strlist[0].trim())) {
                arr.splice(idx, 0, ' ')
            }
            arr.splice(idx, 0, replaceStr)
        }
        return arr.join('')
    }


}
