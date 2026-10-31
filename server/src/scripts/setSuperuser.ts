/**
 * Grants or revokes superuser. Deliberately a CLI script, not an endpoint: there's no
 * superuser to authorise the first one, and it keeps the most powerful flag off the API.
 *
 *   npm -w @pickleball/server run set-superuser -- someone@example.com
 *   npm -w @pickleball/server run set-superuser -- someone@example.com --revoke
 */
import { connectDb, disconnectDb } from '../db/connect';
import { UserModel } from '../models/User';

async function main() {
    const [email, flag] = process.argv.slice(2);

    if (!email || (flag && flag !== '--revoke')) {
        console.error('Usage: set-superuser <email> [--revoke]');
        process.exit(1);
    }

    const isSuperuser = flag !== '--revoke';

    await connectDb();

    const user = await UserModel.findOneAndUpdate(
        { email: email.trim().toLowerCase() },
        { $set: { isSuperuser } },
        { new: true },
    ).lean().exec();

    if (!user) {
        console.error(`No user with email ${email}`);
    } else {
        console.log(`${user.email} isSuperuser = ${user.isSuperuser}`);
    }

    await disconnectDb();
    process.exit(user ? 0 : 1);
}

main().catch(async (error) => {
    console.error(error);
    await disconnectDb();
    process.exit(1);
});
